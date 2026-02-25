"""Unit tests for RAGRetriever service."""

import json
from unittest.mock import AsyncMock

import pytest

from src.core.exceptions import RAGError
from src.core.models import RAGQueryRequest, RAGSource
from src.services.llm.base import BaseLLM
from src.services.rag.base import BaseEmbedding, BaseVectorStore
from src.services.rag.retriever import RAGRetriever

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_embedding():
    """Create a mock embedding provider returning 384-dim vectors."""
    emb = AsyncMock(spec=BaseEmbedding)
    emb.embed.return_value = [0.1] * 384
    emb.embed_batch.return_value = [[0.1] * 384]
    emb.dimension.return_value = 384
    return emb


@pytest.fixture
def mock_vectorstore():
    """Create a mock vector store pre-loaded with two lecture summary results."""
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
        {
            "id": "summary-1-1",
            "text": "Discussion on attention mechanisms",
            "metadata": {
                "recording_id": 1,
                "minute_index": 1,
                "date": "2026-02-10",
                "category": "lecture",
                "keywords": "attention,transformer",
            },
            "distance": 0.4,
        },
    ]
    vs.count.return_value = 2
    return vs


@pytest.fixture
def mock_llm():
    """Create a mock LLM that returns a JSON answer with source indices."""
    llm = AsyncMock(spec=BaseLLM)
    llm.model = "test-model"
    llm.generate.return_value = json.dumps(
        {"answer": "Transformers use self-attention.", "source_indices": [0, 1]}
    )
    return llm


@pytest.fixture
def retriever(mock_llm, mock_embedding, mock_vectorstore):
    """Assemble a RAGRetriever with all mocked dependencies."""
    return RAGRetriever(
        llm=mock_llm,
        embedding=mock_embedding,
        vectorstore=mock_vectorstore,
    )


# ---------------------------------------------------------------------------
# query() tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_query_returns_valid_response(retriever, mock_embedding, mock_vectorstore):
    """Full pipeline returns a valid RAGQueryResponse with sources."""
    request = RAGQueryRequest(query="What are transformers?")
    response = await retriever.query(request)

    assert response.answer == "Transformers use self-attention."
    assert response.model_used == "test-model"
    assert len(response.sources) == 2
    assert response.query_time_ms >= 0

    mock_embedding.embed.assert_called_once_with("What are transformers?")
    mock_vectorstore.search.assert_called_once()


@pytest.mark.asyncio
async def test_query_empty_results(retriever, mock_vectorstore):
    """When vectorstore returns nothing, response has fallback answer."""
    mock_vectorstore.search.return_value = []

    request = RAGQueryRequest(query="unknown topic")
    response = await retriever.query(request)

    assert response.answer == "관련 녹음을 찾을 수 없습니다."
    assert response.sources == []
    assert response.model_used == ""


@pytest.mark.asyncio
async def test_query_filters_by_min_similarity(retriever, mock_vectorstore):
    """Results below min_similarity threshold are filtered out."""
    mock_vectorstore.search.return_value = [
        {
            "id": "summary-1-0",
            "text": "Good match",
            "metadata": {
                "recording_id": 1,
                "minute_index": 0,
                "date": "2026-02-10",
                "category": "lecture",
            },
            "distance": 0.1,  # similarity = 0.9
        },
        {
            "id": "summary-2-0",
            "text": "Poor match",
            "metadata": {
                "recording_id": 2,
                "minute_index": 0,
                "date": "2026-02-10",
                "category": "memo",
            },
            "distance": 0.9,  # similarity = 0.1
        },
    ]

    request = RAGQueryRequest(query="test", min_similarity=0.5)
    response = await retriever.query(request)

    assert len(response.sources) == 1
    assert response.sources[0].recording_id == 1
    assert response.sources[0].similarity == 0.9


@pytest.mark.asyncio
async def test_query_sources_sorted_by_similarity(retriever, mock_vectorstore):
    """Sources are sorted by similarity descending."""
    mock_vectorstore.search.return_value = [
        {
            "id": "summary-2-0",
            "text": "Second best",
            "metadata": {"recording_id": 2, "minute_index": 0, "date": "2026-02-10"},
            "distance": 0.3,
        },
        {
            "id": "summary-1-0",
            "text": "Best match",
            "metadata": {"recording_id": 1, "minute_index": 0, "date": "2026-02-10"},
            "distance": 0.1,
        },
    ]

    request = RAGQueryRequest(query="test", min_similarity=0.0)
    response = await retriever.query(request)

    assert response.sources[0].recording_id == 1
    assert response.sources[1].recording_id == 2


# ---------------------------------------------------------------------------
# _build_where_filter() tests
# ---------------------------------------------------------------------------


def test_build_where_filter_category(retriever):
    """Category filter produces correct ChromaDB where clause."""
    request = RAGQueryRequest(query="test", category="lecture")
    where = retriever._build_where_filter(request)

    assert where == {"category": {"$eq": "lecture"}}


def test_build_where_filter_combined(retriever):
    """Multiple filters are combined with $and."""
    request = RAGQueryRequest(
        query="test",
        category="lecture",
        date_from="2026-02-01",
        date_to="2026-02-28",
    )
    where = retriever._build_where_filter(request)

    assert "$and" in where
    conditions = where["$and"]
    assert {"category": {"$eq": "lecture"}} in conditions
    assert {"date": {"$gte": "2026-02-01"}} in conditions
    assert {"date": {"$lte": "2026-02-28"}} in conditions


def test_build_where_filter_keywords(retriever):
    """Keywords produce $contains conditions."""
    request = RAGQueryRequest(query="test", keywords=["AI", "transformer"])
    where = retriever._build_where_filter(request)

    assert "$and" in where
    conditions = where["$and"]
    assert {"keywords": {"$contains": "AI"}} in conditions
    assert {"keywords": {"$contains": "transformer"}} in conditions


def test_build_where_filter_none(retriever):
    """No filters returns None."""
    request = RAGQueryRequest(query="test")
    where = retriever._build_where_filter(request)

    assert where is None


def test_build_where_filter_single_date(retriever):
    """Single date filter returns a single condition (no $and)."""
    request = RAGQueryRequest(query="test", date_from="2026-02-01")
    where = retriever._build_where_filter(request)

    assert where == {"date": {"$gte": "2026-02-01"}}


# ---------------------------------------------------------------------------
# find_similar() tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_find_similar_excludes_same_recording(retriever, mock_vectorstore, mock_embedding):
    """Results from the same recording_id are excluded."""
    mock_vectorstore.search.side_effect = [
        # First call: get own recording's summaries
        [
            {
                "id": "summary-1-0",
                "text": "Own recording summary",
                "metadata": {"recording_id": 1, "minute_index": 0, "date": "2026-02-10"},
                "distance": 0.0,
            },
        ],
        # Second call: search for similar
        [
            {
                "id": "summary-1-0",
                "text": "Own recording summary",
                "metadata": {"recording_id": 1, "minute_index": 0, "date": "2026-02-10"},
                "distance": 0.0,
            },
            {
                "id": "summary-2-0",
                "text": "Similar recording",
                "metadata": {"recording_id": 2, "minute_index": 0, "date": "2026-02-10"},
                "distance": 0.2,
            },
        ],
    ]

    sources = await retriever.find_similar(recording_id=1, top_k=5)

    assert len(sources) == 1
    assert sources[0].recording_id == 2


@pytest.mark.asyncio
async def test_find_similar_empty_recording(retriever, mock_vectorstore):
    """No summaries for recording returns empty list."""
    mock_vectorstore.search.return_value = []

    sources = await retriever.find_similar(recording_id=999)

    assert sources == []


# ---------------------------------------------------------------------------
# _generate_answer() tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_answer_llm_failure(retriever, mock_llm):
    """LLM failure raises RAGError."""
    mock_llm.generate.side_effect = RuntimeError("LLM unavailable")

    sources = [
        RAGSource(
            recording_id=1,
            minute_index=0,
            summary_text="test",
            similarity=0.9,
            date="2026-02-10",
        ),
    ]

    with pytest.raises(RAGError, match="LLM answer generation failed"):
        await retriever._generate_answer("test query", sources)


@pytest.mark.asyncio
async def test_generate_answer_invalid_json(retriever, mock_llm):
    """LLM returning non-JSON falls back to raw text."""
    mock_llm.generate.return_value = "This is a plain text answer."

    sources = [
        RAGSource(
            recording_id=1,
            minute_index=0,
            summary_text="test",
            similarity=0.9,
            date="2026-02-10",
        ),
    ]

    answer, model = await retriever._generate_answer("test query", sources)
    assert answer == "This is a plain text answer."
    assert model == "test-model"


@pytest.mark.asyncio
async def test_generate_answer_code_fences(retriever, mock_llm):
    """LLM response wrapped in code fences is parsed correctly."""
    mock_llm.generate.return_value = (
        '```json\n{"answer": "fenced answer", "source_indices": [0]}\n```'
    )

    sources = [
        RAGSource(
            recording_id=1,
            minute_index=0,
            summary_text="test",
            similarity=0.9,
            date="2026-02-10",
        ),
    ]

    answer, model = await retriever._generate_answer("test query", sources)
    assert answer == "fenced answer"


# ---------------------------------------------------------------------------
# Embedding failure test
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_query_embedding_failure(retriever, mock_embedding):
    """Embedding failure raises RAGError."""
    mock_embedding.embed.side_effect = RuntimeError("Embedding model failed")

    request = RAGQueryRequest(query="test")

    with pytest.raises(RAGError, match="Failed to embed query"):
        await retriever.query(request)
