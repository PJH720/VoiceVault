"""
Ollama LLM provider implementation.

Uses the Ollama Python SDK (``ollama.AsyncClient``) to interact with a
locally running Ollama server.  Includes automatic retries for transient
connection failures.
"""

import logging

from ollama import AsyncClient, ResponseError
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from src.core.config import get_settings
from src.services.llm.base import BaseLLM

logger = logging.getLogger(__name__)


class OllamaLLM(BaseLLM):
    """Ollama local LLM provider with retry logic.

    Connects to a locally running Ollama server via its REST API.
    Retries transient connection failures up to 3 times with exponential backoff.
    """

    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
        temperature: float = 0.7,
    ) -> None:
        """Initialize the Ollama LLM provider.

        Args:
            base_url: Ollama server URL (falls back to settings if not provided).
            model: Model name to use (e.g. "llama3.2").
            temperature: Sampling temperature for text generation (0.0–1.0).
        """
        settings = get_settings()
        self._base_url = base_url or settings.ollama_base_url
        self._model = model or settings.ollama_model
        self._temperature = temperature
        self._client = AsyncClient(host=self._base_url)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=16),
        retry=retry_if_exception_type((ConnectionError, TimeoutError)),
        reraise=True,
    )
    async def _call_api(
        self,
        messages: list[dict[str, str]],
        temperature: float | None = None,
    ) -> str:
        """Send a chat request to the Ollama server.

        Translates SDK-specific exceptions to standard Python exceptions so
        that upstream callers can retry on ``ConnectionError`` / ``TimeoutError``.
        """
        try:
            response = await self._client.chat(
                model=self._model,
                messages=messages,
                options={
                    "temperature": temperature if temperature is not None else self._temperature
                },
            )
            return response.message.content

        except ConnectionError as exc:
            logger.warning("Ollama connection error (%s): %s", self._base_url, exc)
            raise ConnectionError(
                f"Failed to connect to Ollama at {self._base_url}: {exc}"
            ) from exc
        except TimeoutError as exc:
            logger.warning("Ollama timeout (%s): %s", self._base_url, exc)
            raise TimeoutError(f"Ollama request timed out ({self._base_url}): {exc}") from exc
        except ResponseError as exc:
            logger.error("Ollama response error: %s", exc)
            raise RuntimeError(f"Ollama error: {exc}") from exc
        except Exception as exc:
            logger.error("Unexpected Ollama error: %s", exc)
            raise RuntimeError(f"Ollama error: {exc}") from exc

    async def generate(self, prompt: str, **kwargs) -> str:
        """Generate a free-form text response."""
        messages: list[dict[str, str]] = []
        system = kwargs.pop("system", None)
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        temperature = kwargs.pop("temperature", None)
        return await self._call_api(messages=messages, temperature=temperature)

    async def summarize(self, text: str, **kwargs) -> str:
        """Produce a JSON summary of the given text."""
        system_msg = (
            "You are a concise summarizer. "
            "Output ONLY valid JSON with keys: summary, keywords, topic. "
            "No markdown fences or extra text."
        )
        messages = [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": f"Summarize the following text:\n\n{text}"},
        ]
        return await self._call_api(
            messages=messages,
            temperature=kwargs.get("temperature", 0.3),
        )

    async def classify(self, text: str, categories: list[str], **kwargs) -> str:
        """Classify text into one of the provided categories."""
        categories_str = ", ".join(categories)
        system_msg = (
            "You are a text classifier. "
            "Output ONLY valid JSON with keys: category, confidence. "
            "No markdown fences or extra text."
        )
        user_prompt = (
            f"Classify the following text into one of these categories: {categories_str}\n\n"
            f"Text:\n{text}"
        )
        messages = [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": user_prompt},
        ]
        return await self._call_api(
            messages=messages,
            temperature=kwargs.get("temperature", 0.1),
        )
