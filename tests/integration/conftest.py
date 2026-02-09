"""Integration test fixtures for VoiceVault.

Provides async HTTP client and sync TestClient (for WebSocket) that use
an in-memory SQLite database with real repository operations.
"""

import json
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from starlette.testclient import TestClient

from src.api.app import create_app
from src.services.llm.base import BaseLLM
from src.services.storage import database


@pytest.fixture
def app():
    """Create a fresh FastAPI application instance."""
    return create_app()


@pytest.fixture
async def async_client(app, db_engine):
    """AsyncClient backed by the in-memory test engine.

    Injects the test engine into the database module so that all routes
    use the same in-memory SQLite with tables already created.
    """
    database._engine = db_engine
    database._session_factory = None
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    database.reset_engine()


@pytest.fixture
def test_client(app, db_engine):
    """Synchronous TestClient for WebSocket tests.

    Uses the same DB injection pattern as async_client.
    """
    database._engine = db_engine
    database._session_factory = None
    with TestClient(app) as c:
        yield c
    database.reset_engine()


@pytest.fixture
def mock_llm_for_pipeline():
    """Mock LLM that returns valid summarization JSON."""
    llm = AsyncMock(spec=BaseLLM)
    llm.generate.return_value = json.dumps(
        {
            "summary": "LangChain과 Agent 설계 패턴에 대한 강의 내용",
            "keywords": ["LangChain", "Agent", "AI"],
            "topic": "AI 강의",
        }
    )
    return llm


@pytest.fixture
def sample_transcript_data():
    """Load sample transcript fixture data."""
    fixture_path = Path(__file__).parent.parent / "fixtures" / "sample_transcript.json"
    with open(fixture_path) as f:
        return json.load(f)
