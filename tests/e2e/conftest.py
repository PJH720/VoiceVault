"""E2E test fixtures for VoiceVault full pipeline smoke test.

Provides:
- FakeVectorStore: in-memory vector store shared across orchestrator and RAG endpoint
- Mock providers (STT, LLM, Embedding) with realistic return values
- Unified patch fixture that wires everything together
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import create_async_engine
from starlette.testclient import TestClient

from src.api.app import create_app
from src.services import orchestrator
from src.services.llm.base import BaseLLM
from src.services.rag.base import BaseEmbedding, BaseVectorStore
from src.services.storage import database
from src.services.storage.database import Base
from src.services.transcription.base import BaseSTT


# ---------------------------------------------------------------------------
# FakeVectorStore — in-memory implementation for cross-service sharing
# ---------------------------------------------------------------------------


class FakeVectorStore(BaseVectorStore):
    """Dict-backed vector store that stores and retrieves data in-memory.

    Unlike AsyncMock, this actually persists data so the RAG endpoint can
    find summaries that were embedded by the orchestrator earlier in the test.
    """

    def __init__(self) -> None:
        self._store: dict[str, dict] = {}

    async def add(
        self,
        doc_id: str,
        text: str,
        embedding: list[float],
        metadata: dict,
    ) -> None:
        self._store[doc_id] = {
            "text": text,
            "embedding": embedding,
            "metadata": metadata,
        }

    async def search(
        self,
        embedding: list[float],
        top_k: int = 5,
        where: dict | None = None,
    ) -> list[dict]:
        results = []
        for doc_id, data in self._store.items():
            results.append({
                "id": doc_id,
                "text": data["text"],
                "metadata": data["metadata"],
                "distance": 0.2,
            })
        return results[:top_k]

    async def delete(self, doc_id: str) -> None:
        self._store.pop(doc_id, None)

    async def count(self) -> int:
        return len(self._store)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def app():
    """Create a fresh FastAPI application instance."""
    return create_app()


@pytest.fixture
async def e2e_db_engine(tmp_path):
    """File-based SQLite engine for cross-thread sharing.

    TestClient runs the ASGI app in a separate thread. In-memory SQLite
    databases are per-connection and invisible across threads. A temp-file
    DB is shared by all connections automatically.
    """
    db_path = tmp_path / "e2e_test.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        echo=False,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest.fixture
def e2e_client(app, e2e_db_engine):
    """Sync TestClient with shared in-memory DB for E2E tests."""
    database._engine = e2e_db_engine
    database._session_factory = None
    with TestClient(app) as c:
        yield c
    database.reset_engine()


@pytest.fixture
def fake_vectorstore():
    """Shared in-memory vector store used by both orchestrator and RAG endpoint."""
    return FakeVectorStore()


@pytest.fixture
def e2e_mock_stt():
    """Mock STT that yields Korean transcript per audio chunk."""
    stt = AsyncMock(spec=BaseSTT)

    async def fake_transcribe_stream(audio_chunks, **kwargs):
        async for _ in audio_chunks:
            yield {
                "text": "오늘 강의에서 LangChain의 기본 개념과 Agent 설계 패턴에 대해 학습했습니다",
                "is_final": True,
                "confidence": 0.92,
            }

    stt.transcribe_stream = fake_transcribe_stream
    return stt


@pytest.fixture
def e2e_orch_llm():
    """Mock LLM for orchestrator: handles summarization (.generate) and classification (.classify)."""
    llm = AsyncMock(spec=BaseLLM)
    llm.model = "mock-e2e"
    llm.generate.return_value = json.dumps({
        "summary": "LangChain과 Agent 설계 패턴에 대한 강의 내용 요약",
        "keywords": ["LangChain", "Agent", "AI"],
        "topic": "AI 강의",
    })
    llm.classify.return_value = json.dumps({
        "category": "lecture",
        "confidence": 0.92,
        "reason": "Academic lecture content about AI and LangChain framework",
    })
    return llm


@pytest.fixture
def e2e_rag_llm():
    """Mock LLM for RAG retriever: generates answers with citations."""
    llm = AsyncMock(spec=BaseLLM)
    llm.model = "mock-e2e"
    llm.generate.return_value = json.dumps({
        "answer": "LangChain은 LLM 기반 애플리케이션 개발 프레임워크입니다.",
        "source_indices": [0],
    })
    return llm


@pytest.fixture
def e2e_mock_embedding():
    """Mock embedding provider returning fixed 384-dim vectors."""
    emb = AsyncMock(spec=BaseEmbedding)
    emb.embed.return_value = [0.1] * 384
    emb.embed_batch.return_value = [[0.1] * 384]
    emb.dimension.return_value = 384
    return emb


@pytest.fixture(autouse=True)
def _reset_orchestrator_singleton():
    """Ensure the orchestrator singleton is clean before/after each test."""
    orchestrator._active_session = None
    yield
    orchestrator._active_session = None


@pytest.fixture
def e2e_pipeline(
    e2e_mock_stt,
    e2e_orch_llm,
    e2e_rag_llm,
    e2e_mock_embedding,
    fake_vectorstore,
    tmp_path,
):
    """Apply all patches needed for the E2E pipeline.

    Patches:
    - WebSocket: STT provider
    - Orchestrator: settings, LLM, embedding, vectorstore
    - RAG endpoint: LLM, embedding, vectorstore (same fake instance)
    - Export: settings (exports_dir → tmp_path)
    """
    mock_settings = MagicMock()
    mock_settings.llm_provider = "mock"
    mock_settings.embedding_provider = "local"
    mock_settings.exports_dir = str(tmp_path / "exports")
    mock_settings.recordings_dir = str(tmp_path / "recordings")
    mock_settings.obsidian_frontmatter = True
    mock_settings.obsidian_wikilinks = False
    mock_settings.obsidian_vault_path = ""
    mock_settings.obsidian_export_folder = "VoiceVault"

    with (
        # WebSocket: STT + settings
        patch("src.api.websocket.create_stt", return_value=e2e_mock_stt),
        patch("src.api.websocket.get_settings", return_value=mock_settings),
        # Orchestrator: providers
        patch("src.services.orchestrator.get_settings", return_value=mock_settings),
        patch("src.services.orchestrator.create_llm", return_value=e2e_orch_llm),
        patch("src.services.orchestrator.create_embedding", return_value=e2e_mock_embedding),
        patch("src.services.orchestrator.create_vectorstore", return_value=fake_vectorstore),
        # RAG endpoint: providers (shared vectorstore)
        patch("src.api.routes.rag.create_llm", return_value=e2e_rag_llm),
        patch("src.api.routes.rag.create_embedding", return_value=e2e_mock_embedding),
        patch("src.api.routes.rag.create_vectorstore", return_value=fake_vectorstore),
        # Export: settings (tmp_path for file I/O)
        patch("src.services.storage.export.get_settings", return_value=mock_settings),
    ):
        yield {
            "mock_settings": mock_settings,
            "fake_vectorstore": fake_vectorstore,
            "tmp_path": tmp_path,
        }
