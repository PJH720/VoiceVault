"""Integration tests for RAG API endpoints."""

import json
from unittest.mock import AsyncMock, patch

import pytest

from src.services.llm.base import BaseLLM
from src.services.rag.base import BaseEmbedding, BaseVectorStore
from src.services.storage import database
from src.services.storage.repository import RecordingRepository

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_rag_embedding():
    emb = AsyncMock(spec=BaseEmbedding)
    emb.embed.return_value = [0.1] * 384
    emb.dimension.return_value = 384
    return emb


@pytest.fixture
def mock_rag_vectorstore():
    vs = AsyncMock(spec=BaseVectorStore)
    vs.search.return_value = [
        {
            "id": "summary-1-0",
            "text": "AI lecture about transformers",
            "metadata": {
                "recording_id": 1,
                "minute_index": 0,
                "date": "2026-02-10",
                "category": "lecture",
                "keywords": "AI,transformer",
            },
            "distance": 0.2,
        },
    ]
    vs.count.return_value = 1
    return vs


@pytest.fixture
def mock_rag_llm():
    llm = AsyncMock(spec=BaseLLM)
    llm.model = "test-model"
    llm.generate.return_value = json.dumps(
        {"answer": "Transformers use self-attention.", "source_indices": [0]}
    )
    return llm


@pytest.fixture
def patch_rag_providers(mock_rag_llm, mock_rag_embedding, mock_rag_vectorstore):
    """Patch the factory functions used by the RAG endpoints."""
    with (
        patch(
            "src.api.routes.rag.create_llm",
            return_value=mock_rag_llm,
        ),
        patch(
            "src.api.routes.rag.create_embedding",
            return_value=mock_rag_embedding,
        ),
        patch(
            "src.api.routes.rag.create_vectorstore",
            return_value=mock_rag_vectorstore,
        ),
    ):
        yield


# ---------------------------------------------------------------------------
# POST /rag/query
# ---------------------------------------------------------------------------


async def test_rag_query_endpoint(async_client, patch_rag_providers):
    """POST /rag/query returns 200 with valid RAGQueryResponse."""
    resp = await async_client.post(
        "/api/v1/rag/query",
        json={"query": "What are transformers?"},
    )
    assert resp.status_code == 200

    body = resp.json()
    assert body["answer"] == "Transformers use self-attention."
    assert body["model_used"] == "test-model"
    assert len(body["sources"]) == 1
    assert body["sources"][0]["recording_id"] == 1
    assert body["query_time_ms"] >= 0


async def test_rag_query_saves_to_db(async_client, patch_rag_providers):
    """Verify query is logged in the rag_queries table."""
    resp = await async_client.post(
        "/api/v1/rag/query",
        json={"query": "What are transformers?"},
    )
    assert resp.status_code == 200

    async with database.get_session() as session:
        repo = RecordingRepository(session)
        queries = await repo.list_rag_queries(limit=10)

    assert len(queries) >= 1
    latest = queries[0]
    assert latest.query_text == "What are transformers?"
    assert latest.answer_text == "Transformers use self-attention."
    assert latest.model_used == "test-model"


async def test_rag_query_empty_store(async_client, mock_rag_vectorstore, patch_rag_providers):
    """Empty vector store returns graceful fallback response."""
    mock_rag_vectorstore.search.return_value = []

    resp = await async_client.post(
        "/api/v1/rag/query",
        json={"query": "unknown topic"},
    )
    assert resp.status_code == 200

    body = resp.json()
    assert body["answer"] == "관련 녹음을 찾을 수 없습니다."
    assert body["sources"] == []


# ---------------------------------------------------------------------------
# GET /rag/similar/{recording_id}
# ---------------------------------------------------------------------------


async def test_rag_similar_endpoint(async_client, mock_rag_vectorstore, patch_rag_providers):
    """GET /rag/similar/{id} returns list of similar sources."""
    # First call returns own recording docs, second call returns similar results
    mock_rag_vectorstore.search.side_effect = [
        [
            {
                "id": "summary-1-0",
                "text": "Own recording text",
                "metadata": {
                    "recording_id": 1,
                    "minute_index": 0,
                    "date": "2026-02-10",
                },
                "distance": 0.0,
            },
        ],
        [
            {
                "id": "summary-2-0",
                "text": "Similar recording",
                "metadata": {
                    "recording_id": 2,
                    "minute_index": 0,
                    "date": "2026-02-10",
                    "category": "lecture",
                },
                "distance": 0.15,
            },
        ],
    ]

    resp = await async_client.get("/api/v1/rag/similar/1", params={"top_k": 3})
    assert resp.status_code == 200

    body = resp.json()
    assert isinstance(body, list)
    assert len(body) == 1
    assert body[0]["recording_id"] == 2


async def test_rag_similar_empty(async_client, mock_rag_vectorstore, patch_rag_providers):
    """No summaries for recording returns empty list."""
    mock_rag_vectorstore.search.return_value = []

    resp = await async_client.get("/api/v1/rag/similar/999")
    assert resp.status_code == 200
    assert resp.json() == []
