"""
Claude LLM provider implementation.

Uses the Anthropic Python SDK (``anthropic.AsyncAnthropic``) to interact with
the Claude API.  Includes rate-limit semaphore and automatic retries for
transient errors.
"""

import asyncio
import logging

from anthropic import (
    APIConnectionError,
    APITimeoutError,
    AsyncAnthropic,
    RateLimitError,
)
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from src.core.config import get_settings
from src.services.llm.base import BaseLLM

logger = logging.getLogger(__name__)


class ClaudeLLM(BaseLLM):
    """Claude API LLM provider with rate-limit semaphore and retry logic."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.7,
        max_concurrent: int = 5,
    ) -> None:
        settings = get_settings()
        self._api_key = api_key or settings.claude_api_key
        self._model = model or settings.claude_model
        self._max_tokens = max_tokens
        self._temperature = temperature
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._client = AsyncAnthropic(api_key=self._api_key)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=16),
        retry=retry_if_exception_type((ConnectionError, TimeoutError)),
        reraise=True,
    )
    async def _call_api(
        self,
        user_prompt: str,
        system: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> str:
        """Send a request to Claude, respecting the concurrency semaphore.

        All SDK exceptions are translated to standard Python exceptions so that
        upstream callers (e.g. ``MinuteSummarizer``) can rely on
        ``ConnectionError`` / ``TimeoutError`` for retry decisions.
        """
        async with self._semaphore:
            try:
                kwargs: dict = {
                    "model": self._model,
                    "max_tokens": max_tokens or self._max_tokens,
                    "temperature": temperature if temperature is not None else self._temperature,
                    "messages": [{"role": "user", "content": user_prompt}],
                }
                if system:
                    kwargs["system"] = system

                response = await self._client.messages.create(**kwargs)
                return response.content[0].text

            except APITimeoutError as exc:
                logger.warning("Claude API timeout: %s", exc)
                raise TimeoutError(f"Claude API request timed out: {exc}") from exc
            except APIConnectionError as exc:
                logger.warning("Claude API connection error: %s", exc)
                raise ConnectionError(f"Failed to connect to Claude API: {exc}") from exc
            except RateLimitError as exc:
                logger.warning("Claude API rate limit hit: %s", exc)
                raise ConnectionError(f"Claude API rate limit exceeded: {exc}") from exc
            except Exception as exc:
                logger.error("Unexpected Claude API error: %s", exc)
                raise RuntimeError(f"Claude API error: {exc}") from exc

    async def generate(self, prompt: str, **kwargs) -> str:
        """Generate a free-form text response."""
        system = kwargs.pop("system", None)
        temperature = kwargs.pop("temperature", None)
        max_tokens = kwargs.pop("max_tokens", None)
        return await self._call_api(
            user_prompt=prompt,
            system=system,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    async def summarize(self, text: str, **kwargs) -> str:
        """Produce a JSON summary of the given text."""
        system = (
            "You are a concise summarizer. "
            "Output ONLY valid JSON with keys: summary, keywords, topic. "
            "No markdown fences or extra text."
        )
        user_prompt = f"Summarize the following text:\n\n{text}"
        return await self._call_api(
            user_prompt=user_prompt,
            system=system,
            temperature=kwargs.get("temperature", 0.3),
            max_tokens=kwargs.get("max_tokens"),
        )

    async def classify(self, text: str, categories: list[str], **kwargs) -> str:
        """Classify text into one of the provided categories."""
        categories_str = ", ".join(categories)
        system = (
            "You are a text classifier. "
            "Output ONLY valid JSON with keys: category, confidence. "
            "No markdown fences or extra text."
        )
        user_prompt = (
            f"Classify the following text into one of these categories: {categories_str}\n\n"
            f"Text:\n{text}"
        )
        return await self._call_api(
            user_prompt=user_prompt,
            system=system,
            temperature=kwargs.get("temperature", 0.1),
            max_tokens=kwargs.get("max_tokens"),
        )
