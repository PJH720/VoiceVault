"""
Embedding provider implementations.

Provides two embedding backends:
- ``SentenceTransformerEmbedding``: Local sentence-transformers (default: all-MiniLM-L6-v2, 384-dim)
- ``OllamaEmbedding``: Ollama server embeddings (default: nomic-embed-text, 768-dim)
"""

import asyncio
import logging

from ollama import AsyncClient

from src.core.config import get_settings
from src.services.rag.base import BaseEmbedding

logger = logging.getLogger(__name__)


class SentenceTransformerEmbedding(BaseEmbedding):
    """Local embedding using sentence-transformers.

    Loads the model lazily on first call. Wraps synchronous ``.encode()``
    in ``asyncio.to_thread()`` to avoid blocking the event loop.
    """

    def __init__(self, model_name: str | None = None) -> None:
        settings = get_settings()
        self._model_name = model_name or settings.embedding_model
        self._model = None

    def _load_model(self):
        """Lazily load the sentence-transformers model."""
        if self._model is None:
            from sentence_transformers import SentenceTransformer

            self._model = SentenceTransformer(self._model_name)
            logger.info("Loaded sentence-transformers model: %s", self._model_name)
        return self._model

    async def embed(self, text: str) -> list[float]:
        """Generate an embedding for a single text."""
        model = self._load_model()
        vector = await asyncio.to_thread(model.encode, text, normalize_embeddings=True)
        return vector.tolist()

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for multiple texts."""
        if not texts:
            return []
        model = self._load_model()
        vectors = await asyncio.to_thread(model.encode, texts, normalize_embeddings=True)
        return [v.tolist() for v in vectors]

    def dimension(self) -> int:
        """Return embedding dimension (384 for all-MiniLM-L6-v2)."""
        model = self._load_model()
        return model.get_sentence_embedding_dimension()


class OllamaEmbedding(BaseEmbedding):
    """Ollama server embedding using the embeddings API.

    Connects to a locally running Ollama server. Default model is
    ``nomic-embed-text`` (768-dim).
    """

    KNOWN_DIMENSIONS = {
        "nomic-embed-text": 768,
        "mxbai-embed-large": 1024,
        "all-minilm": 384,
    }

    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
    ) -> None:
        settings = get_settings()
        self._base_url = base_url or settings.ollama_base_url
        self._model = model or settings.ollama_embedding_model
        self._client = AsyncClient(host=self._base_url)

    async def embed(self, text: str) -> list[float]:
        """Generate an embedding for a single text via Ollama."""
        try:
            response = await self._client.embeddings(model=self._model, prompt=text)
            return response.embedding
        except Exception as exc:
            logger.error("Ollama embedding error: %s", exc)
            raise RuntimeError(f"Ollama embedding error: {exc}") from exc

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for multiple texts (sequential calls)."""
        if not texts:
            return []
        results = []
        for text in texts:
            vector = await self.embed(text)
            results.append(vector)
        return results

    def dimension(self) -> int:
        """Return embedding dimension based on known model dimensions."""
        return self.KNOWN_DIMENSIONS.get(self._model, 768)
