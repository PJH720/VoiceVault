"""Unit tests for the background summarization orchestrator."""

import asyncio
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.core.exceptions import RecordingAlreadyActiveError
from src.core.models import MinuteSummaryResult
from src.services import orchestrator
from src.services.orchestrator import RecordingSession

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mock_summarizer():
    """Create a mock MinuteSummarizer."""
    summarizer = AsyncMock()
    summarizer.summarize_minute.return_value = MinuteSummaryResult(
        minute_index=0,
        summary_text="Test summary",
        keywords=["test", "AI"],
        topic="testing",
    )
    return summarizer


def _make_session(
    mock_notify,
    summarizer=None,
    interval=0.1,
    recording_id=1,
):
    """Create a RecordingSession with mocked internals (no DB)."""
    session = RecordingSession.__new__(RecordingSession)
    session.recording_id = recording_id
    session._notify = mock_notify
    session._interval = interval
    session._queue = asyncio.Queue()
    session._stop_event = asyncio.Event()
    session._task = None
    session._previous_summary = None
    session._summarizer = summarizer or _mock_summarizer()
    session._embedding = None
    session._vectorstore = None
    return session


@pytest.fixture(autouse=True)
async def _reset_singleton():
    """Ensure the singleton is cleared before and after each test."""
    orchestrator._active_session = None
    yield
    orchestrator._active_session = None


@pytest.fixture
def mock_notify():
    """Async mock for the WebSocket notify callback."""
    return AsyncMock()


@pytest.fixture
def mock_db():
    """Mock get_session and RecordingRepository for unit tests."""
    mock_repo = AsyncMock()

    @asynccontextmanager
    async def fake_get_session():
        yield MagicMock()

    mock_settings = MagicMock()
    mock_settings.llm_provider = "mock"

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
        yield mock_repo


# ---------------------------------------------------------------------------
# Session lifecycle
# ---------------------------------------------------------------------------


@patch("src.services.orchestrator.create_vectorstore")
@patch("src.services.orchestrator.create_embedding")
@patch("src.services.orchestrator.create_llm")
@patch("src.services.orchestrator.get_settings")
async def test_start_session_creates_active_session(
    mock_settings, mock_create_llm, mock_create_embed, mock_create_vs, mock_notify
):
    """start_session should create and register an active session."""
    mock_settings.return_value.llm_provider = "ollama"
    mock_settings.return_value.embedding_provider = "local"
    mock_create_llm.return_value = AsyncMock()

    session = await orchestrator.start_session(
        recording_id=1,
        notify=mock_notify,
        summarization_interval=0.1,
    )

    assert session is not None
    assert orchestrator.get_active_session() is session
    assert session.recording_id == 1

    # Cleanup
    orchestrator._active_session = None
    session._stop_event.set()
    if session._task:
        await session._task


@patch("src.services.orchestrator.create_vectorstore")
@patch("src.services.orchestrator.create_embedding")
@patch("src.services.orchestrator.create_llm")
@patch("src.services.orchestrator.get_settings")
async def test_start_session_rejects_second(
    mock_settings, mock_create_llm, mock_create_embed, mock_create_vs, mock_notify
):
    """Starting a second session should raise RecordingAlreadyActiveError."""
    mock_settings.return_value.llm_provider = "ollama"
    mock_settings.return_value.embedding_provider = "local"
    mock_create_llm.return_value = AsyncMock()

    session = await orchestrator.start_session(
        recording_id=1,
        notify=mock_notify,
        summarization_interval=0.1,
    )

    with pytest.raises(RecordingAlreadyActiveError):
        await orchestrator.start_session(
            recording_id=2,
            notify=mock_notify,
            summarization_interval=0.1,
        )

    # Cleanup
    orchestrator._active_session = None
    session._stop_event.set()
    if session._task:
        await session._task


# ---------------------------------------------------------------------------
# Queue processing
# ---------------------------------------------------------------------------


async def test_enqueue_and_summarize(mock_notify, mock_db):
    """Enqueued transcripts should be processed by the background loop."""
    summarizer = _mock_summarizer()
    session = _make_session(mock_notify, summarizer=summarizer)

    session.start()

    session.enqueue_transcript(0, "First transcript")
    session.enqueue_transcript(1, "Second transcript")
    session.enqueue_transcript(2, "Third transcript")

    # Wait for processing
    await asyncio.sleep(0.3)

    session._stop_event.set()
    if session._task:
        await session._task

    assert summarizer.summarize_minute.call_count == 3
    assert mock_notify.call_count == 3


async def test_stop_drains_remaining(mock_notify, mock_db):
    """Stopping should process all remaining transcripts in the queue."""
    summarizer = _mock_summarizer()
    session = _make_session(mock_notify, summarizer=summarizer, interval=60.0)

    session.start()

    # Enqueue without waiting for the interval
    session.enqueue_transcript(0, "Pending transcript 1")
    session.enqueue_transcript(1, "Pending transcript 2")

    # Stop should drain the queue
    await session.stop()

    assert summarizer.summarize_minute.call_count == 2
    mock_db.stop_recording.assert_called_once_with(1)


# ---------------------------------------------------------------------------
# Notify callback
# ---------------------------------------------------------------------------


async def test_notify_callback_on_success(mock_notify, mock_db):
    """Successful summarization should call the notify callback with data."""
    summarizer = _mock_summarizer()
    session = _make_session(mock_notify, summarizer=summarizer)

    session.start()
    session.enqueue_transcript(0, "Test text")

    await asyncio.sleep(0.3)
    session._stop_event.set()
    if session._task:
        await session._task

    mock_notify.assert_called()
    call_data = mock_notify.call_args[0][0]
    assert call_data["summary_text"] == "Test summary"
    assert call_data["keywords"] == ["test", "AI"]


async def test_notify_failure_does_not_crash(mock_notify, mock_db):
    """If notify callback raises, summarization should continue."""
    mock_notify.side_effect = [ConnectionError("ws closed"), None]
    summarizer = _mock_summarizer()
    session = _make_session(mock_notify, summarizer=summarizer)

    session.start()
    session.enqueue_transcript(0, "First")
    session.enqueue_transcript(1, "Second")

    await asyncio.sleep(0.3)
    session._stop_event.set()
    if session._task:
        await session._task

    # Both transcripts were processed despite first notify failing
    assert summarizer.summarize_minute.call_count == 2


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------


async def test_summarization_failure_continues(mock_notify, mock_db):
    """If one summarization fails, the next should still run."""
    summarizer = _mock_summarizer()
    summarizer.summarize_minute.side_effect = [
        Exception("LLM down"),
        MinuteSummaryResult(
            minute_index=1,
            summary_text="Second worked",
            keywords=["ok"],
            topic="recovery",
        ),
    ]
    session = _make_session(mock_notify, summarizer=summarizer)

    session.start()
    session.enqueue_transcript(0, "Will fail")
    session.enqueue_transcript(1, "Will succeed")

    await asyncio.sleep(0.3)
    session._stop_event.set()
    if session._task:
        await session._task

    assert summarizer.summarize_minute.call_count == 2
    # Notify should have been called for error + success
    assert mock_notify.call_count >= 1


# ---------------------------------------------------------------------------
# Finalization
# ---------------------------------------------------------------------------


async def test_finalize_updates_status(mock_notify, mock_db):
    """stop() should call repo.stop_recording() to finalize."""
    session = _make_session(mock_notify, recording_id=42)

    session.start()
    await session.stop()

    mock_db.stop_recording.assert_called_once_with(42)


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


async def test_empty_text_skipped(mock_notify, mock_db):
    """Empty transcript text should be skipped, no LLM call made."""
    summarizer = _mock_summarizer()
    session = _make_session(mock_notify, summarizer=summarizer)

    session.start()
    session.enqueue_transcript(0, "")
    session.enqueue_transcript(1, "   ")

    await asyncio.sleep(0.3)
    session._stop_event.set()
    if session._task:
        await session._task

    summarizer.summarize_minute.assert_not_called()


@patch("src.services.orchestrator.create_vectorstore")
@patch("src.services.orchestrator.create_embedding")
@patch("src.services.orchestrator.create_llm")
@patch("src.services.orchestrator.get_settings")
async def test_cleanup_stops_active(
    mock_settings, mock_create_llm, mock_create_embed, mock_create_vs, mock_notify
):
    """cleanup() should clear the singleton and stop the session."""
    mock_settings.return_value.llm_provider = "ollama"
    mock_settings.return_value.embedding_provider = "local"
    mock_create_llm.return_value = AsyncMock()

    session = await orchestrator.start_session(
        recording_id=1,
        notify=mock_notify,
        summarization_interval=0.1,
    )

    assert orchestrator.get_active_session() is not None

    with patch.object(session, "stop", new_callable=AsyncMock) as mock_stop:
        await orchestrator.cleanup()

    mock_stop.assert_called_once()
    assert orchestrator.get_active_session() is None
