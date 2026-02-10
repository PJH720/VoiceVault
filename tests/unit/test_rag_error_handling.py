"""Regression tests for RAG/embedding error handling (Issue #38).

Verifies that:
1. RAG query rejects overly long queries (max_length=2000)
2. create_embedding() raises RAGError for unknown providers
3. OllamaEmbedding.embed() raises RAGError on failure
4. SentenceTransformerEmbedding._load_model() raises RAGError on failure
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.core.exceptions import RAGError
from src.services.rag import create_embedding


# ---------------------------------------------------------------------------
# Bug 1: RAG query max_length validation
# ---------------------------------------------------------------------------


def test_rag_query_rejects_long_query():
    """POST /rag/query with >2000 char query should fail Pydantic validation."""
    from src.core.models import RAGQueryRequest

    with pytest.raises(Exception):  # ValidationError
        RAGQueryRequest(query="x" * 2001)


def test_rag_query_accepts_valid_length():
    """POST /rag/query with <=2000 char query should pass validation."""
    from src.core.models import RAGQueryRequest

    req = RAGQueryRequest(query="x" * 2000)
    assert len(req.query) == 2000


# ---------------------------------------------------------------------------
# Bug 2: create_embedding() factory error type
# ---------------------------------------------------------------------------


def test_create_embedding_unknown_provider_raises_rag_error():
    """create_embedding() with unknown provider should raise RAGError, not ValueError."""
    with pytest.raises(RAGError, match="Unknown embedding provider"):
        create_embedding("nonexistent_provider")


# ---------------------------------------------------------------------------
# Bug 3: OllamaEmbedding raises RAGError
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ollama_embedding_error_raises_rag_error():
    """OllamaEmbedding.embed() should raise RAGError on connection failure."""
    with patch("src.services.rag.embeddings.get_settings") as mock_settings:
        mock_settings.return_value = MagicMock(
            ollama_base_url="http://localhost:11434",
            ollama_embedding_model="nomic-embed-text",
        )
        from src.services.rag.embeddings import OllamaEmbedding

        emb = OllamaEmbedding()
        emb._client = AsyncMock()
        emb._client.embeddings.side_effect = ConnectionError("server down")

        with pytest.raises(RAGError, match="Ollama embedding error"):
            await emb.embed("test text")


# ---------------------------------------------------------------------------
# Bug 4: SentenceTransformerEmbedding model load error handling
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sentence_transformer_bad_model_raises_rag_error():
    """SentenceTransformerEmbedding._load_model() should raise RAGError on failure."""
    with patch("src.services.rag.embeddings.get_settings") as mock_settings:
        mock_settings.return_value = MagicMock(
            embedding_model="nonexistent-model-xyz",
        )
        with patch(
            "src.services.rag.embeddings.SentenceTransformer",
            side_effect=OSError("model not found"),
            create=True,
        ):
            from src.services.rag.embeddings import SentenceTransformerEmbedding

            emb = SentenceTransformerEmbedding(model_name="nonexistent-model-xyz")

            with pytest.raises(RAGError, match="Failed to load embedding model"):
                emb._load_model()
