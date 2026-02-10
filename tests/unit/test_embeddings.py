"""Unit tests for embedding providers."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest

from src.core.exceptions import RAGError
from src.services.rag.base import BaseEmbedding
from src.services.rag.embeddings import OllamaEmbedding, SentenceTransformerEmbedding

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mock_settings(**overrides):
    """Return a fake Settings object with sensible defaults."""
    defaults = {
        "embedding_model": "all-MiniLM-L6-v2",
        "ollama_base_url": "http://localhost:11434",
        "ollama_embedding_model": "nomic-embed-text",
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


# ---------------------------------------------------------------------------
# TestSentenceTransformerEmbedding
# ---------------------------------------------------------------------------


class TestSentenceTransformerEmbedding:
    """Tests for the local sentence-transformers embedding provider."""

    @pytest.fixture
    def mock_st_model(self):
        """Return a mock SentenceTransformer model."""
        model = MagicMock()
        model.encode.return_value = np.array([0.1, 0.2, 0.3])
        model.get_sentence_embedding_dimension.return_value = 384
        return model

    @pytest.fixture
    def embedding(self, mock_st_model):
        """Create a SentenceTransformerEmbedding with a mocked model."""
        with patch(
            "src.services.rag.embeddings.get_settings",
            return_value=_mock_settings(),
        ):
            instance = SentenceTransformerEmbedding()
        # Inject the mock model directly
        instance._model = mock_st_model
        return instance

    async def test_embed_returns_list_of_floats(self, embedding, mock_st_model):
        mock_st_model.encode.return_value = np.array([0.1, 0.2, 0.3])

        result = await embedding.embed("test text")

        assert isinstance(result, list)
        assert len(result) == 3
        assert all(isinstance(v, float) for v in result)

    async def test_embed_calls_encode_with_normalize(self, embedding, mock_st_model):
        mock_st_model.encode.return_value = np.array([0.5, 0.5])

        await embedding.embed("hello world")

        mock_st_model.encode.assert_called_once_with(
            "hello world", normalize_embeddings=True
        )

    async def test_embed_batch_returns_list_of_vectors(self, embedding, mock_st_model):
        mock_st_model.encode.return_value = np.array([[0.1, 0.2], [0.3, 0.4]])

        result = await embedding.embed_batch(["text1", "text2"])

        assert len(result) == 2
        assert result[0] == [0.1, 0.2]
        assert result[1] == [0.3, 0.4]

    async def test_embed_batch_empty_returns_empty(self, embedding):
        result = await embedding.embed_batch([])

        assert result == []

    async def test_dimension_returns_model_dimension(self, embedding, mock_st_model):
        mock_st_model.get_sentence_embedding_dimension.return_value = 384

        assert embedding.dimension() == 384

    def test_defaults_from_settings(self):
        settings = _mock_settings()
        with patch(
            "src.services.rag.embeddings.get_settings",
            return_value=settings,
        ):
            instance = SentenceTransformerEmbedding()

        assert instance._model_name == "all-MiniLM-L6-v2"

    def test_explicit_model_overrides_settings(self):
        settings = _mock_settings()
        with patch(
            "src.services.rag.embeddings.get_settings",
            return_value=settings,
        ):
            instance = SentenceTransformerEmbedding(model_name="custom-model")

        assert instance._model_name == "custom-model"

    def test_implements_base_interface(self, embedding):
        assert isinstance(embedding, BaseEmbedding)


# ---------------------------------------------------------------------------
# TestOllamaEmbedding
# ---------------------------------------------------------------------------


class TestOllamaEmbedding:
    """Tests for the Ollama embedding provider."""

    @pytest.fixture
    def mock_ollama_client(self):
        """Return a mock Ollama AsyncClient."""
        client = AsyncMock()
        client.embeddings = AsyncMock(
            return_value=SimpleNamespace(embedding=[0.1, 0.2, 0.3])
        )
        return client

    @pytest.fixture
    def embedding(self, mock_ollama_client):
        """Create an OllamaEmbedding with a mocked client."""
        with patch(
            "src.services.rag.embeddings.get_settings",
            return_value=_mock_settings(),
        ):
            with patch(
                "src.services.rag.embeddings.AsyncClient",
                return_value=mock_ollama_client,
            ):
                instance = OllamaEmbedding()
        return instance

    async def test_embed_returns_list_of_floats(self, embedding, mock_ollama_client):
        mock_ollama_client.embeddings.return_value = SimpleNamespace(
            embedding=[0.1, 0.2, 0.3]
        )

        result = await embedding.embed("test text")

        assert result == [0.1, 0.2, 0.3]

    async def test_embed_calls_ollama_with_correct_params(
        self, embedding, mock_ollama_client
    ):
        mock_ollama_client.embeddings.return_value = SimpleNamespace(embedding=[0.5])

        await embedding.embed("hello")

        mock_ollama_client.embeddings.assert_called_once_with(
            model="nomic-embed-text", prompt="hello"
        )

    async def test_embed_batch_calls_each_text(self, embedding, mock_ollama_client):
        mock_ollama_client.embeddings.return_value = SimpleNamespace(
            embedding=[0.1, 0.2]
        )

        result = await embedding.embed_batch(["a", "b", "c"])

        assert len(result) == 3
        assert mock_ollama_client.embeddings.call_count == 3

    async def test_embed_batch_empty_returns_empty(self, embedding):
        result = await embedding.embed_batch([])

        assert result == []

    async def test_embed_raises_rag_error_on_failure(
        self, embedding, mock_ollama_client
    ):
        mock_ollama_client.embeddings.side_effect = Exception("connection refused")

        with pytest.raises(RAGError, match="Ollama embedding error"):
            await embedding.embed("test")

    def test_dimension_known_model(self):
        settings = _mock_settings()
        with patch(
            "src.services.rag.embeddings.get_settings",
            return_value=settings,
        ):
            with patch("src.services.rag.embeddings.AsyncClient"):
                instance = OllamaEmbedding()

        assert instance.dimension() == 768

    def test_dimension_unknown_model_defaults_768(self):
        settings = _mock_settings(ollama_embedding_model="custom-unknown")
        with patch(
            "src.services.rag.embeddings.get_settings",
            return_value=settings,
        ):
            with patch("src.services.rag.embeddings.AsyncClient"):
                instance = OllamaEmbedding()

        assert instance.dimension() == 768

    def test_defaults_from_settings(self):
        settings = _mock_settings()
        with patch(
            "src.services.rag.embeddings.get_settings",
            return_value=settings,
        ):
            with patch("src.services.rag.embeddings.AsyncClient"):
                instance = OllamaEmbedding()

        assert instance._base_url == "http://localhost:11434"
        assert instance._model == "nomic-embed-text"

    def test_implements_base_interface(self, embedding):
        assert isinstance(embedding, BaseEmbedding)


# ---------------------------------------------------------------------------
# TestCreateEmbedding factory
# ---------------------------------------------------------------------------


class TestCreateEmbedding:
    """Tests for the create_embedding factory function."""

    def test_local_creates_sentence_transformer(self):
        with patch(
            "src.services.rag.embeddings.get_settings",
            return_value=_mock_settings(),
        ):
            from src.services.rag import create_embedding

            instance = create_embedding("local")

        assert isinstance(instance, SentenceTransformerEmbedding)

    def test_ollama_creates_ollama_embedding(self):
        with patch(
            "src.services.rag.embeddings.get_settings",
            return_value=_mock_settings(),
        ):
            with patch("src.services.rag.embeddings.AsyncClient"):
                from src.services.rag import create_embedding

                instance = create_embedding("ollama")

        assert isinstance(instance, OllamaEmbedding)

    def test_unknown_provider_raises_rag_error(self):
        from src.services.rag import create_embedding

        with pytest.raises(RAGError, match="Unknown embedding provider"):
            create_embedding("unknown_provider")
