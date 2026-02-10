"""RAG retriever service.

Orchestrates the embed → search → rerank → LLM answer pipeline for
natural-language queries over past recordings stored in ChromaDB.
"""

import json
import logging
import re
import time

from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from src.core.exceptions import RAGError
from src.core.models import RAGQueryRequest, RAGQueryResponse, RAGSource
from src.services.llm.base import BaseLLM
from src.services.rag.base import BaseEmbedding, BaseVectorStore

logger = logging.getLogger(__name__)

RAG_SYSTEM_PROMPT = (
    "다음 컨텍스트만을 기반으로 답변하세요. 컨텍스트에 없는 정보는 추측하지 마세요.\n"
    "각 출처를 [source: recording-{recording_id}, minute-{minute_index}] 형태로 인용하세요.\n"
    'Output ONLY valid JSON: {"answer": "...", "source_indices": [0, 1, ...]}'
)


def _strip_code_fences(text: str) -> str:
    """Remove markdown code fences wrapping JSON from LLM responses."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```\w*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    return text.strip()


class RAGRetriever:
    """Orchestrates RAG queries: embed → vector search → LLM answer."""

    def __init__(
        self,
        llm: BaseLLM,
        embedding: BaseEmbedding,
        vectorstore: BaseVectorStore,
    ) -> None:
        self._llm = llm
        self._embedding = embedding
        self._vectorstore = vectorstore

    async def query(self, request: RAGQueryRequest) -> RAGQueryResponse:
        """Run the full RAG pipeline for a natural-language query.

        Args:
            request: The RAG query request with query text and filters.

        Returns:
            RAGQueryResponse with grounded answer and cited sources.

        Raises:
            RAGError: If embedding or LLM calls fail.
        """
        start = time.monotonic()

        try:
            query_embedding = await self._embedding.embed(request.query)
        except Exception as exc:
            raise RAGError(detail=f"Failed to embed query: {exc}") from exc

        where = self._build_where_filter(request)

        try:
            raw_results = await self._vectorstore.search(
                embedding=query_embedding,
                top_k=request.top_k,
                where=where,
            )
        except Exception as exc:
            raise RAGError(detail=f"Vector search failed: {exc}") from exc

        sources = self._results_to_sources(raw_results, request.min_similarity)

        if not sources:
            elapsed_ms = int((time.monotonic() - start) * 1000)
            return RAGQueryResponse(
                answer="관련 녹음을 찾을 수 없습니다.",
                sources=[],
                model_used="",
                query_time_ms=elapsed_ms,
            )

        answer, model_used = await self._generate_answer(request.query, sources)

        elapsed_ms = int((time.monotonic() - start) * 1000)
        return RAGQueryResponse(
            answer=answer,
            sources=sources,
            model_used=model_used,
            query_time_ms=elapsed_ms,
        )

    async def find_similar(
        self,
        recording_id: int,
        top_k: int = 5,
    ) -> list[RAGSource]:
        """Find recordings similar to the given recording.

        Fetches the recording's summaries from the vector store, combines
        their text, embeds it, and searches for similar content from other
        recordings.

        Args:
            recording_id: The recording to find similar content for.
            top_k: Maximum number of similar results.

        Returns:
            A list of RAGSource objects from other recordings.
        """
        own_results = await self._vectorstore.search(
            embedding=await self._embedding.embed(""),
            top_k=100,
            where={"recording_id": recording_id},
        )

        if not own_results:
            return []

        combined_text = " ".join(r.get("text", "") for r in own_results if r.get("text"))
        if not combined_text.strip():
            return []

        try:
            combined_embedding = await self._embedding.embed(combined_text)
        except Exception as exc:
            raise RAGError(detail=f"Failed to embed combined text: {exc}") from exc

        search_results = await self._vectorstore.search(
            embedding=combined_embedding,
            top_k=top_k + len(own_results),
        )

        filtered = [
            r for r in search_results if r.get("metadata", {}).get("recording_id") != recording_id
        ]

        return self._results_to_sources(filtered[:top_k], min_similarity=0.0)

    def _build_where_filter(self, request: RAGQueryRequest) -> dict | None:
        """Build a ChromaDB ``where`` clause from request filters.

        Args:
            request: The RAG query request containing optional filters.

        Returns:
            A ChromaDB where dict, or None if no filters are set.
        """
        conditions: list[dict] = []

        if request.category:
            conditions.append({"category": {"$eq": request.category}})

        if request.date_from:
            conditions.append({"date": {"$gte": request.date_from}})

        if request.date_to:
            conditions.append({"date": {"$lte": request.date_to}})

        if request.keywords:
            for kw in request.keywords:
                conditions.append({"keywords": {"$contains": kw}})

        if not conditions:
            return None
        if len(conditions) == 1:
            return conditions[0]
        return {"$and": conditions}

    def _results_to_sources(
        self,
        results: list[dict],
        min_similarity: float,
    ) -> list[RAGSource]:
        """Convert raw vector store results to RAGSource objects.

        Filters by minimum similarity (similarity = 1 - distance for cosine)
        and sorts by similarity descending.

        Args:
            results: Raw dicts from vector store search.
            min_similarity: Minimum similarity threshold.

        Returns:
            Filtered and sorted list of RAGSource.
        """
        sources: list[RAGSource] = []
        for r in results:
            distance = r.get("distance", 0.0)
            similarity = 1.0 - distance
            if similarity < min_similarity:
                continue

            metadata = r.get("metadata", {})
            sources.append(
                RAGSource(
                    recording_id=metadata.get("recording_id", 0),
                    minute_index=metadata.get("minute_index", 0),
                    summary_text=r.get("text", ""),
                    similarity=round(similarity, 4),
                    date=metadata.get("date", ""),
                    category=metadata.get("category", ""),
                )
            )

        sources.sort(key=lambda s: s.similarity, reverse=True)
        return sources

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
        retry=retry_if_exception_type((ConnectionError, TimeoutError)),
        reraise=True,
    )
    async def _call_llm(self, prompt: str) -> str:
        """Call LLM generate with retry for transient failures."""
        return await self._llm.generate(prompt)

    async def _generate_answer(
        self,
        query: str,
        sources: list[RAGSource],
    ) -> tuple[str, str]:
        """Generate a grounded answer from sources using the LLM.

        Args:
            query: The user's natural-language question.
            sources: Retrieved and filtered RAGSource objects.

        Returns:
            A tuple of (answer_text, model_name).

        Raises:
            RAGError: If the LLM call fails.
        """
        context_lines = []
        for i, src in enumerate(sources):
            context_lines.append(
                f"[{i}] recording-{src.recording_id}, "
                f"minute-{src.minute_index} ({src.date}): "
                f"{src.summary_text}"
            )
        context = "\n".join(context_lines)

        prompt = f"{RAG_SYSTEM_PROMPT}\n\nContext:\n{context}\n\nQuestion: {query}"

        try:
            raw = await self._call_llm(prompt)
        except Exception as exc:
            raise RAGError(detail=f"LLM answer generation failed: {exc}") from exc

        raw = _strip_code_fences(raw)

        try:
            data = json.loads(raw)
            answer = data.get("answer", raw)
        except json.JSONDecodeError:
            answer = raw

        model_used = getattr(self._llm, "model", "unknown")
        return answer, str(model_used)
