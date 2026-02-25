"""Stress-test fixtures for VoiceVault long-running recording simulations.

Provides:
- File-based temp SQLite for real file-size measurement
- Real ChromaDB for actual HNSW performance testing
- Mock LLM/Embedding with varied per-call return values
- Session factory using __new__() bypass pattern
"""

import asyncio
import json
import math
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import create_async_engine

from src.services import orchestrator
from src.services.llm.base import BaseLLM
from src.services.rag.base import BaseEmbedding
from src.services.rag.vectorstore import ChromaVectorStore
from src.services.storage import database
from src.services.storage.database import Base
from src.services.summarization.minute_summarizer import MinuteSummarizer

# ---------------------------------------------------------------------------
# Database — file-based temp SQLite for real file-size measurement
# ---------------------------------------------------------------------------


@pytest.fixture
async def stress_db_engine(tmp_path):
    """File-based SQLite engine for cross-thread sharing and file-size measurement."""
    db_path = tmp_path / "stress_test.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        echo=False,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Inject into database module
    old_engine = database._engine
    old_factory = database._session_factory
    database._engine = engine
    database._session_factory = None

    yield engine

    # Restore
    database._engine = old_engine
    database._session_factory = old_factory
    await engine.dispose()


# ---------------------------------------------------------------------------
# ChromaDB — real persistent store for HNSW performance testing
# ---------------------------------------------------------------------------


@pytest.fixture
def stress_chroma(tmp_path):
    """Real ChromaDB with temp persist dir for actual HNSW performance testing."""
    chroma_dir = tmp_path / "chroma_stress"
    chroma_dir.mkdir()
    return ChromaVectorStore(persist_dir=str(chroma_dir))


# ---------------------------------------------------------------------------
# Mock LLM — varied JSON summaries per call
# ---------------------------------------------------------------------------

TOPICS = [
    "AI lecture",
    "project meeting",
    "study session",
    "casual chat",
    "lab discussion",
    "code review",
    "brainstorming",
    "Q&A session",
    "tutorial",
    "workshop",
    "seminar",
    "group work",
]


def _make_summary_json(minute_index: int) -> str:
    """Generate varied but deterministic summary JSON for a given minute."""
    topic = TOPICS[minute_index % len(TOPICS)]
    hour = minute_index // 60
    return json.dumps(
        {
            "summary": f"Minute {minute_index} (hour {hour}): Discussion about {topic} topics.",
            "keywords": [
                f"keyword_{minute_index}",
                topic.split()[0].lower(),
                f"concept_{minute_index % 50}",
            ],
            "topic": topic,
        }
    )


@pytest.fixture
def stress_mock_llm():
    """Mock LLM with varied per-call summaries based on call count."""
    llm = AsyncMock(spec=BaseLLM)
    call_counter = {"n": 0}

    async def _side_effect(prompt: str, **kwargs) -> str:
        idx = call_counter["n"]
        call_counter["n"] += 1
        return _make_summary_json(idx)

    llm.generate.side_effect = _side_effect
    return llm


# ---------------------------------------------------------------------------
# Mock Embedding — deterministic but slightly varied 384-dim vectors
# ---------------------------------------------------------------------------


@pytest.fixture
def stress_mock_embedding():
    """Mock embedding with deterministic but varied 384-dim vectors per call."""
    emb = AsyncMock(spec=BaseEmbedding)
    call_counter = {"n": 0}

    async def _embed_side_effect(text: str) -> list[float]:
        idx = call_counter["n"]
        call_counter["n"] += 1
        # Create a unique-ish vector: base 0.1 + small perturbation from idx
        base = 0.1
        return [base + 0.001 * math.sin(i + idx * 0.1) for i in range(384)]

    emb.embed.side_effect = _embed_side_effect
    emb.dimension.return_value = 384
    return emb


# ---------------------------------------------------------------------------
# Orchestrator singleton reset
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _reset_orchestrator_singleton():
    """Ensure the orchestrator singleton is clean before/after each test."""
    orchestrator._active_session = None
    yield
    orchestrator._active_session = None


# ---------------------------------------------------------------------------
# Session factory — __new__() bypass (same pattern as unit tests)
# ---------------------------------------------------------------------------


@pytest.fixture
def stress_session_factory(stress_mock_llm, stress_mock_embedding, stress_chroma):
    """Factory that creates a RecordingSession bypassing __init__.

    Wires mock LLM + mock embedding + real ChromaDB vectorstore.
    Uses the same __new__() bypass pattern from tests/unit/test_orchestrator.py.
    """
    mock_settings = MagicMock()
    mock_settings.llm_provider = "mock"
    mock_settings.embedding_provider = "local"

    mock_repo = AsyncMock()
    mock_repo.stop_recording.return_value = None
    mock_repo.list_summaries.return_value = []

    @asynccontextmanager
    async def fake_get_session():
        yield MagicMock()

    def _create(recording_id: int, notify=None):
        session = orchestrator.RecordingSession.__new__(orchestrator.RecordingSession)
        session.recording_id = recording_id
        session._notify = notify or AsyncMock()
        session._interval = 0.1
        session._queue = asyncio.Queue()
        session._stop_event = asyncio.Event()
        session._task = None
        session._previous_summary = None

        # Wire real MinuteSummarizer with mock LLM
        session._summarizer = MinuteSummarizer(stress_mock_llm)

        # Wire RAG pipeline: mock embedding + real ChromaDB
        session._embedding = stress_mock_embedding
        session._vectorstore = stress_chroma

        return session

    # Patch get_session and RecordingRepository for _process_one's DB writes
    with (
        patch(
            "src.services.orchestrator.get_session",
            side_effect=fake_get_session,
        ),
        patch(
            "src.services.orchestrator.RecordingRepository",
            return_value=mock_repo,
        ),
        patch(
            "src.services.orchestrator.get_settings",
            return_value=mock_settings,
        ),
    ):
        yield _create
