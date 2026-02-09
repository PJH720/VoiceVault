"""
1-minute auto-summarization service.

Takes a 1-minute transcript and produces a structured JSON summary
using the configured LLM provider. Supports continuous context by
accepting the previous minute's summary for coherence.
"""

import json
import logging

from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from src.core.exceptions import SummarizationError
from src.core.models import MinuteSummaryResult
from src.services.llm.base import BaseLLM
from src.services.summarization.base import BaseSummarizer

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a transcription summarizer. "
    "Given a 1-minute transcript, produce a JSON summary.\n\n"
    "Rules:\n"
    "- Output ONLY valid JSON, no markdown fences or extra text.\n"
    '- Format: {"summary": "...", "keywords": [...], "topic": "..."}\n'
    "- summary: 1-2 concise sentences capturing the key content (max 50 tokens).\n"
    "- keywords: 2-5 important terms or phrases from the transcript.\n"
    '- topic: a short label for the main topic (e.g. "AI lecture", "project meeting").\n'
    "- Preserve the original language of the transcript (Korean, English, etc.)."
)


def _build_user_prompt(transcript: str, previous_context: str | None) -> str:
    """Build the user prompt including transcript and optional context."""
    parts = []
    if previous_context:
        parts.append(f"Previous minute summary for context:\n{previous_context}\n")
    parts.append(f"Transcript to summarize:\n{transcript}")
    return "\n".join(parts)


class MinuteSummarizer(BaseSummarizer):
    """Summarizes 1-minute transcript segments using an LLM provider."""

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

    async def summarize_minute(
        self,
        transcript: str,
        minute_index: int,
        previous_context: str | None = None,
    ) -> MinuteSummaryResult:
        """Summarize a 1-minute transcript segment.

        Args:
            transcript: The transcript text for this minute.
            minute_index: Zero-based index of this minute in the recording.
            previous_context: Optional summary from the previous minute
                for continuity across segments.

        Returns:
            A MinuteSummaryResult with summary text, keywords, and topic.

        Raises:
            SummarizationError: If the LLM fails or returns invalid JSON.
        """
        if not transcript or not transcript.strip():
            return MinuteSummaryResult(
                minute_index=minute_index,
                summary_text="",
                keywords=[],
                topic="",
            )

        user_prompt = _build_user_prompt(transcript, previous_context)
        full_prompt = f"{SYSTEM_PROMPT}\n\n{user_prompt}"

        try:
            raw_response = await self._call_llm(full_prompt)
        except Exception as exc:
            raise SummarizationError(
                detail=f"LLM call failed for minute {minute_index}: {exc}"
            ) from exc

        try:
            data = json.loads(raw_response)
        except json.JSONDecodeError as exc:
            raise SummarizationError(
                detail=f"Invalid JSON from LLM for minute {minute_index}: {raw_response[:200]}"
            ) from exc

        return MinuteSummaryResult(
            minute_index=minute_index,
            summary_text=data.get("summary", ""),
            keywords=data.get("keywords", []),
            topic=data.get("topic", ""),
        )
