"""
Abstract base class for summarization providers.

All summarization implementations must implement this interface,
enabling provider-agnostic summarization in the service layer.
"""

from abc import ABC, abstractmethod

from src.core.models import MinuteSummaryResult


class BaseSummarizer(ABC):
    """Interface that every summarizer must implement."""

    @abstractmethod
    async def summarize_minute(
        self,
        transcript: str,
        minute_index: int,
        previous_context: str | None = None,
        user_context: str | None = None,
    ) -> MinuteSummaryResult:
        """Summarize a 1-minute transcript segment.

        Args:
            transcript: The transcript text for this minute.
            minute_index: Zero-based index of this minute in the recording.
            previous_context: Optional summary from the previous minute
                for continuity across segments.
            user_context: Optional user-provided context (topic, key terms)
                for STT error correction.

        Returns:
            A MinuteSummaryResult with summary text, keywords, and topic.
        """
