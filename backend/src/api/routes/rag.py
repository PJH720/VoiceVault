"""
RAG REST endpoints.

Provides reindex, natural-language query, and similar-recording endpoints.
"""

import logging

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from src.core.config import get_settings
from src.core.models import RAGQueryRequest, RAGQueryResponse, RAGSource
from src.services.llm import create_llm
from src.services.rag import create_embedding, create_vectorstore
from src.services.rag.retriever import RAGRetriever
from src.services.storage.database import get_session
from src.services.storage.repository import RecordingRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rag", tags=["rag"])


class ReindexResponse(BaseModel):
    """Response from a reindex operation."""

    reindexed: int = 0
    errors: int = 0
    total_in_store: int = 0


class ReindexDetailResponse(BaseModel):
    """Detailed response from a reindex operation."""

    status: str = "completed"
    result: ReindexResponse = Field(default_factory=ReindexResponse)


@router.post("/reindex", response_model=ReindexDetailResponse)
async def reindex_summaries():
    """Rebuild the ChromaDB vector index from all existing summaries.

    Iterates over every recording and re-embeds all their minute summaries.
    Useful after changing the embedding model or recovering from data loss.
    """
    settings = get_settings()
    embedding = create_embedding(provider=settings.embedding_provider)
    vectorstore = create_vectorstore()

    reindexed = 0
    errors = 0

    async with get_session() as session:
        repo = RecordingRepository(session)
        recordings = await repo.list_recordings(limit=10000)

        for recording in recordings:
            summaries = await repo.list_summaries(recording.id)
            for summary in summaries:
                try:
                    vector = await embedding.embed(summary.summary_text)
                    doc_id = f"summary-{summary.recording_id}-{summary.minute_index}"
                    metadata = {
                        "recording_id": summary.recording_id,
                        "minute_index": summary.minute_index,
                        "date": summary.created_at.isoformat() if summary.created_at else "",
                        "keywords": ",".join(summary.keywords) if summary.keywords else "",
                    }
                    await vectorstore.add(
                        doc_id=doc_id,
                        text=summary.summary_text,
                        embedding=vector,
                        metadata=metadata,
                    )
                    reindexed += 1
                except Exception:
                    logger.warning(
                        "Failed to reindex summary %s (recording=%s, minute=%s)",
                        summary.id,
                        summary.recording_id,
                        summary.minute_index,
                    )
                    errors += 1

    total = await vectorstore.count()

    return ReindexDetailResponse(
        status="completed",
        result=ReindexResponse(
            reindexed=reindexed,
            errors=errors,
            total_in_store=total,
        ),
    )


def _create_retriever() -> RAGRetriever:
    """Build a RAGRetriever wired to the configured LLM, embedding, and vector store."""
    settings = get_settings()
    return RAGRetriever(
        llm=create_llm(provider=settings.llm_provider),
        embedding=create_embedding(provider=settings.embedding_provider),
        vectorstore=create_vectorstore(),
    )


@router.post("/query", response_model=RAGQueryResponse)
async def rag_query(request: RAGQueryRequest):
    """Search past recordings with a natural-language query.

    Pipeline: embed query -> ChromaDB similarity search -> metadata filter
    -> LLM generates a grounded answer with source citations.
    The query and results are also persisted for analytics.
    """
    retriever = _create_retriever()
    response = await retriever.query(request)

    # Persist the query and results for usage analytics
    async with get_session() as session:
        repo = RecordingRepository(session)
        await repo.create_rag_query(
            query_text=request.query,
            results_json=[s.model_dump() for s in response.sources],
            model_used=response.model_used,
            answer_text=response.answer,
            sources=[s.model_dump() for s in response.sources],
        )

    return response


@router.get("/similar/{recording_id}", response_model=list[RAGSource])
async def rag_similar(
    recording_id: int,
    top_k: int = Query(default=5, ge=1, le=50),
):
    """Find recordings similar to the given recording via vector similarity."""
    retriever = _create_retriever()
    return await retriever.find_similar(recording_id=recording_id, top_k=top_k)
