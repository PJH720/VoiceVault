"""
Abstract base class for LLM providers.

All LLM implementations (Claude, Ollama, etc.) must implement this interface,
enabling provider-agnostic business logic in the service layer.
"""

from abc import ABC, abstractmethod


class BaseLLM(ABC):
    """Interface that every LLM provider must implement."""

    @abstractmethod
    async def generate(self, prompt: str, **kwargs) -> str:
        """Generate a free-form text response.

        Args:
            prompt: The user/system prompt to send to the model.
            **kwargs: Provider-specific options (temperature, max_tokens, etc.).

        Returns:
            The model's text response.
        """

    @abstractmethod
    async def summarize(self, text: str, **kwargs) -> str:
        """Produce a concise summary of the given text.

        Args:
            text: Source text to summarize (e.g. a 1-minute transcript).
            **kwargs: Provider-specific options.

        Returns:
            JSON string with at least ``summary`` and ``keywords`` fields.
        """

    @abstractmethod
    async def classify(self, text: str, categories: list[str], **kwargs) -> str:
        """Classify text into one of the provided categories.

        Args:
            text: Text to classify.
            categories: List of possible category labels.
            **kwargs: Provider-specific options.

        Returns:
            JSON string with ``category`` and ``confidence`` fields.
        """
