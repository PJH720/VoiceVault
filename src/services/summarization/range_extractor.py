"""
Cross-boundary range extraction and re-summarization service.

Allows users to select any arbitrary time range (e.g., 00:40-01:20) across
hour boundaries and get a unified summary from the minute-level summaries
within that range.
"""

import json
import logging

from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from src.core.exceptions import SummarizationError
from src.core.models import ExtractRangeResponse
from src.services.llm.base import BaseLLM
from src.services.summarization.minute_summarizer import _strip_code_fences

logger = logging.getLogger(__name__)

RANGE_SYSTEM_PROMPT = (
    "You are a transcription summarizer. "
    "Integrate the following minute-level summaries from a selected time range "
    "into a single cohesive summary.\n\n"
    "Rules:\n"
    "- Output ONLY valid JSON, no markdown fences or extra text.\n"
    '- Format: {"summary": "...", "keywords": [...]}\n'
    "- summary: A comprehensive paragraph capturing the key content "
    "of the selected range (max 300 tokens).\n"
    "- keywords: 5-10 important terms or phrases.\n"
    "- Preserve the original language of the summaries "
    "(Korean, English, etc.)."
)


class RangeExtractor:
    """Extracts and re-summarizes an arbitrary minute range from a recording."""

    def __init__(self, llm: BaseLLM) -> None:
        self._llm = llm

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
        retry=retry_if_exception_type((ConnectionError, TimeoutError)),
        reraise=True,
    )
    async def _call_llm(self, prompt: str) -> str:
        """Call LLM with retry for transient failures."""
        return await self._llm.generate(prompt)

    async def extract_range(
        self,
        recording_id: int,
        start_minute: int,
        end_minute: int,
        summaries: list[tuple[int, str]],
    ) -> ExtractRangeResponse:
        """Re-summarize minute summaries within an arbitrary time range.

        Args:
            recording_id: ID of the parent recording.
            start_minute: Start of the selected range (inclusive).
            end_minute: End of the selected range (inclusive).
            summaries: List of (minute_index, summary_text) tuples,
                pre-fetched and ordered by minute_index.

        Returns:
            ExtractRangeResponse with the unified summary and metadata.

        Raises:
            SummarizationError: If no summaries provided, LLM call fails,
                or LLM returns invalid JSON.
        """
        if not summaries:
            raise SummarizationError(
                detail=(
                    f"No summaries found in range [{start_minute}, {end_minute}] "
                    f"for recording {recording_id}"
                )
            )

        numbered = "\n".join(f"[Minute {idx}] {text}" for idx, text in summaries)
        user_prompt = (
            f"Time range: minute {start_minute} to {end_minute}\n"
            f"Summaries to integrate:\n{numbered}"
        )
        full_prompt = f"{RANGE_SYSTEM_PROMPT}\n\n{user_prompt}"

        try:
            raw = await self._call_llm(full_prompt)
        except Exception as exc:
            raise SummarizationError(
                detail=(
                    f"LLM call failed for range [{start_minute}, {end_minute}] "
                    f"of recording {recording_id}: {exc}"
                )
            ) from exc

        try:
            raw = _strip_code_fences(raw)
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise SummarizationError(
                detail=(
                    f"Invalid JSON from LLM for range [{start_minute}, {end_minute}]: {raw[:200]}"
                )
            ) from exc

        return ExtractRangeResponse(
            recording_id=recording_id,
            start_minute=start_minute,
            end_minute=end_minute,
            summary_text=data.get("summary", ""),
            keywords=data.get("keywords", []),
            included_minutes=[idx for idx, _ in summaries],
            source_count=len(summaries),
            model_used=getattr(self._llm, "model", ""),
        )
