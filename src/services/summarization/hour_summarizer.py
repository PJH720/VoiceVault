"""
Hierarchical hour-level summarization service.

Implements a 3-level compression pipeline:
  60 x 1-min summaries (~12,000 tokens)
    -> 6 x 10-min summaries (~1,800 tokens, 85% reduction)
      -> 1 x 1-hour summary (~600 tokens, 95% reduction)
"""

import asyncio
import json
import logging

from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from src.core.exceptions import SummarizationError
from src.core.models import HourSummaryResult
from src.services.llm.base import BaseLLM
from src.services.summarization.minute_summarizer import _strip_code_fences

logger = logging.getLogger(__name__)

TEN_MINUTE_SYSTEM_PROMPT = (
    "You are a transcription summarizer. "
    "Integrate the following one-minute summaries into a single cohesive "
    "10-minute summary.\n\n"
    "Rules:\n"
    "- Output ONLY valid JSON, no markdown fences or extra text.\n"
    '- Format: {"summary": "...", "keywords": [...], "topics": [...]}\n'
    "- summary: A concise paragraph capturing the key content "
    "(max 150 tokens).\n"
    "- keywords: 3-8 important terms or phrases from the summaries.\n"
    "- topics: short labels for distinct topics discussed.\n"
    "- Preserve the original language of the summaries "
    "(Korean, English, etc.)."
)

HOUR_SYSTEM_PROMPT = (
    "You are a transcription summarizer. "
    "Integrate the following 10-minute summaries into a single cohesive "
    "1-hour summary.\n\n"
    "Rules:\n"
    "- Output ONLY valid JSON, no markdown fences or extra text.\n"
    '- Format: {"summary": "...", "keywords": [...], '
    '"topic_segments": [{"topic": "...", "minutes": "0-10"}]}\n'
    "- summary: A comprehensive paragraph capturing the key content "
    "(max 300 tokens).\n"
    "- keywords: 5-10 important terms or phrases.\n"
    "- topic_segments: list of topic labels with their minute ranges.\n"
    "- Preserve the original language of the summaries "
    "(Korean, English, etc.)."
)

# Limit concurrent LLM calls for 10-min chunk summarization
_SEMAPHORE_LIMIT = 3


def _estimate_tokens(text: str) -> int:
    """Rough token estimate using the ~4 characters per token heuristic.

    This is a fast approximation; actual token counts vary by model and language.
    """
    return len(text) // 4


class HourSummarizer:
    """Produces hour-level summaries via hierarchical compression.

    Pipeline: 60 one-min summaries -> 6 ten-min groups (parallel LLM calls)
    -> 1 hour summary. Achieves ~95% token reduction.
    """

    def __init__(self, llm: BaseLLM) -> None:
        """Initialize with the configured LLM provider.

        Args:
            llm: An LLM provider implementing ``BaseLLM``.
        """
        self._llm = llm
        self._semaphore = asyncio.Semaphore(_SEMAPHORE_LIMIT)

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
        retry=retry_if_exception_type((ConnectionError, TimeoutError)),
        reraise=True,
    )
    async def _call_llm(self, prompt: str) -> str:
        """Call LLM with retry for transient failures."""
        return await self._llm.generate(prompt)

    async def _call_llm_limited(self, prompt: str) -> str:
        """Call LLM with concurrency limit via semaphore."""
        async with self._semaphore:
            return await self._call_llm(prompt)

    async def _summarize_ten_minutes(
        self,
        chunk: list[str],
        chunk_index: int,
    ) -> dict:
        """Summarize a chunk of up to 10 one-minute summaries.

        Args:
            chunk: List of 1-min summary texts.
            chunk_index: Zero-based index of this 10-min chunk.

        Returns:
            Parsed dict with summary, keywords, topics.
        """
        numbered = "\n".join(f"[Minute {i + 1}] {s}" for i, s in enumerate(chunk))
        user_prompt = f"One-minute summaries to integrate:\n{numbered}"
        full_prompt = f"{TEN_MINUTE_SYSTEM_PROMPT}\n\n{user_prompt}"

        try:
            raw = await self._call_llm_limited(full_prompt)
        except Exception as exc:
            raise SummarizationError(
                detail=f"LLM call failed for 10-min chunk {chunk_index}: {exc}"
            ) from exc

        try:
            raw = _strip_code_fences(raw)
            data: dict = json.loads(raw)
            return data
        except json.JSONDecodeError as exc:
            raise SummarizationError(
                detail=(f"Invalid JSON from LLM for 10-min chunk {chunk_index}: {raw[:200]}")
            ) from exc

    async def summarize_hour(
        self,
        recording_id: int,
        hour_index: int,
        minute_summaries: list[str],
    ) -> HourSummaryResult:
        """Produce an hour-level summary from 1-min summaries.

        Uses a two-level pipeline:
          1. Group into 10-min chunks -> LLM call per chunk (parallel)
          2. Combine 10-min summaries -> single LLM call for hour summary

        Args:
            recording_id: ID of the parent recording.
            hour_index: Zero-based hour index within the recording.
            minute_summaries: List of 1-min summary texts (up to 60).

        Returns:
            HourSummaryResult with the final summary, keywords,
            topic_segments, and token count.

        Raises:
            SummarizationError: If any LLM call fails or returns invalid JSON.
        """
        if not minute_summaries:
            return HourSummaryResult(hour_index=hour_index, summary_text="")

        input_tokens = sum(_estimate_tokens(s) for s in minute_summaries)

        # --- Level 1: Group into 10-minute chunks and summarize each ---
        chunks = [minute_summaries[i : i + 10] for i in range(0, len(minute_summaries), 10)]

        if len(chunks) == 1:
            # Only one chunk (≤10 minutes) — skip intermediate grouping
            ten_min_texts = minute_summaries
        else:
            # Summarize all 10-min chunks in parallel (bounded by semaphore)
            ten_min_results = await asyncio.gather(
                *(self._summarize_ten_minutes(chunk, idx) for idx, chunk in enumerate(chunks))
            )
            ten_min_texts = [r.get("summary", "") for r in ten_min_results]

        # --- Level 2: 1-hr summary ---
        numbered = "\n".join(
            f"[Minutes {i * 10}-{(i + 1) * 10}] {s}" for i, s in enumerate(ten_min_texts)
        )
        user_prompt = f"Ten-minute summaries to integrate:\n{numbered}"
        full_prompt = f"{HOUR_SYSTEM_PROMPT}\n\n{user_prompt}"

        try:
            raw = await self._call_llm_limited(full_prompt)
        except Exception as exc:
            raise SummarizationError(
                detail=(f"LLM call failed for hour {hour_index} of recording {recording_id}: {exc}")
            ) from exc

        try:
            raw = _strip_code_fences(raw)
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise SummarizationError(
                detail=(f"Invalid JSON from LLM for hour {hour_index}: {raw[:200]}")
            ) from exc

        summary_text = data.get("summary", "")
        output_tokens = _estimate_tokens(summary_text)

        logger.info(
            "Hour %d summary: %d input tokens -> %d output tokens (%.0f%% reduction)",
            hour_index,
            input_tokens,
            output_tokens,
            (1 - output_tokens / max(input_tokens, 1)) * 100,
        )

        return HourSummaryResult(
            hour_index=hour_index,
            summary_text=summary_text,
            keywords=data.get("keywords", []),
            topic_segments=data.get("topic_segments", []),
            token_count=output_tokens,
            model_used=getattr(self._llm, "model", ""),
        )
