"""Unit tests for the background summarization orchestrator."""

import asyncio
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.core.exceptions import RecordingAlreadyActiveError
from src.core.models import ClassificationResult, MinuteSummaryResult
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


# ---------------------------------------------------------------------------
# RAG pipeline init failure (lines 74-77)
# ---------------------------------------------------------------------------


@patch("src.services.orchestrator.create_vectorstore", side_effect=RuntimeError("chroma down"))
@patch("src.services.orchestrator.create_embedding")
@patch("src.services.orchestrator.create_llm")
@patch("src.services.orchestrator.get_settings")
async def test_rag_init_failure_falls_back_gracefully(
    mock_settings,
    mock_create_llm,
    mock_create_embed,
    mock_create_vs,
):
    """If RAG init fails, session should still work with embedding disabled."""
    mock_settings.return_value.llm_provider = "ollama"
    mock_settings.return_value.embedding_provider = "local"
    mock_create_llm.return_value = AsyncMock()

    session = RecordingSession(
        recording_id=1,
        notify=AsyncMock(),
        summarization_interval=0.1,
    )

    assert session._embedding is None
    assert session._vectorstore is None


# ---------------------------------------------------------------------------
# stop() DB failure (lines 100-101)
# ---------------------------------------------------------------------------


async def test_stop_db_failure_is_non_fatal(mock_notify):
    """stop() should not crash even if repo.stop_recording() raises."""
    mock_repo = AsyncMock()
    mock_repo.stop_recording.side_effect = RuntimeError("DB locked")
    mock_repo.list_summaries.return_value = []

    mock_settings = MagicMock()
    mock_settings.llm_provider = "mock"

    @asynccontextmanager
    async def fake_get_session():
        yield MagicMock()

    session = _make_session(mock_notify, recording_id=99)

    with (
        patch("src.services.orchestrator.get_session", side_effect=fake_get_session),
        patch("src.services.orchestrator.RecordingRepository", return_value=mock_repo),
        patch("src.services.orchestrator.get_settings", return_value=mock_settings),
    ):
        session.start()
        await session.stop()  # Should not raise

    mock_repo.stop_recording.assert_called_once_with(99)


# ---------------------------------------------------------------------------
# Summarization loop crash (line 123)
# ---------------------------------------------------------------------------


async def test_summarization_loop_crash_still_drains(mock_notify, mock_db):
    """If the loop body raises unexpectedly, finally block still drains."""
    summarizer = _mock_summarizer()
    session = _make_session(mock_notify, summarizer=summarizer, interval=0.1)

    # Make _drain_and_summarize raise on first call, then work normally
    original_drain = session._drain_and_summarize
    call_count = 0

    async def crashing_drain():
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise RuntimeError("unexpected crash")
        await original_drain()

    session._drain_and_summarize = crashing_drain

    session.start()
    # Enqueue after a short delay to ensure the crash happens first
    await asyncio.sleep(0.05)
    session.enqueue_transcript(0, "After crash")
    session._stop_event.set()
    if session._task:
        await session._task

    # The finally block should have drained the remaining transcript
    assert call_count >= 2


# ---------------------------------------------------------------------------
# QueueEmpty race condition (lines 138-139)
# ---------------------------------------------------------------------------


async def test_queue_empty_race_condition(mock_notify, mock_db):
    """_drain_and_summarize handles QueueEmpty if queue empties between check and get."""
    summarizer = _mock_summarizer()
    session = _make_session(mock_notify, summarizer=summarizer)

    # Simulate race: empty() returns False once, then True forever
    empty_returns = iter([False] + [True] * 50)
    session._queue = MagicMock()
    session._queue.empty.side_effect = lambda: next(empty_returns)
    session._queue.get_nowait.side_effect = asyncio.QueueEmpty()

    session.start()
    await asyncio.sleep(0.2)
    session._stop_event.set()
    if session._task:
        await session._task

    # No crash, summarizer never called
    summarizer.summarize_minute.assert_not_called()


# ---------------------------------------------------------------------------
# Error notify also fails (lines 207-208)
# ---------------------------------------------------------------------------


async def test_error_notify_also_fails(mock_notify, mock_db):
    """If summarization fails AND error notify fails, loop should continue."""
    summarizer = _mock_summarizer()
    summarizer.summarize_minute.side_effect = [
        Exception("LLM down"),
        MinuteSummaryResult(
            minute_index=1,
            summary_text="Recovered",
            keywords=["ok"],
            topic="recovery",
        ),
    ]
    # Notify always raises - covers both the error notify and success notify paths
    mock_notify.side_effect = ConnectionError("ws dead")

    session = _make_session(mock_notify, summarizer=summarizer)
    session.start()
    session.enqueue_transcript(0, "Will fail")
    session.enqueue_transcript(1, "Will succeed")

    await asyncio.sleep(0.3)
    session._stop_event.set()
    if session._task:
        await session._task

    # Both were attempted despite all notify failures
    assert summarizer.summarize_minute.call_count == 2


# ---------------------------------------------------------------------------
# Embed summary happy path (lines 221-240)
# ---------------------------------------------------------------------------


async def test_embed_summary_happy_path(mock_notify, mock_db):
    """Successful embedding should store vector in vectorstore."""
    summarizer = _mock_summarizer()
    session = _make_session(mock_notify, summarizer=summarizer)

    # Enable RAG pipeline
    mock_embedding = AsyncMock()
    mock_embedding.embed.return_value = [0.1] * 384
    mock_vectorstore = AsyncMock()
    session._embedding = mock_embedding
    session._vectorstore = mock_vectorstore

    session.start()
    session.enqueue_transcript(0, "Embed this")

    await asyncio.sleep(0.3)
    session._stop_event.set()
    if session._task:
        await session._task

    mock_embedding.embed.assert_called_once_with("Test summary")
    mock_vectorstore.add.assert_called_once()
    call_kwargs = mock_vectorstore.add.call_args[1]
    assert call_kwargs["doc_id"] == "summary-1-0"
    assert call_kwargs["text"] == "Test summary"


# ---------------------------------------------------------------------------
# Embed summary failure (lines 239-244 — implicit via exception)
# ---------------------------------------------------------------------------


async def test_embed_summary_failure_is_non_fatal(mock_notify, mock_db):
    """Embedding failure should be logged but not block summarization."""
    summarizer = _mock_summarizer()
    session = _make_session(mock_notify, summarizer=summarizer)

    mock_embedding = AsyncMock()
    mock_embedding.embed.side_effect = RuntimeError("embedding model missing")
    session._embedding = mock_embedding
    session._vectorstore = AsyncMock()

    session.start()
    session.enqueue_transcript(0, "Will embed-fail")

    await asyncio.sleep(0.3)
    session._stop_event.set()
    if session._task:
        await session._task

    # Summarization still completed and notified despite embed failure
    summarizer.summarize_minute.assert_called_once()
    mock_notify.assert_called_once()


# ---------------------------------------------------------------------------
# Classification — no summaries (lines 254-258)
# ---------------------------------------------------------------------------


async def test_classify_skips_when_no_summaries(mock_notify):
    """Classification should skip if recording has no summaries."""
    mock_repo = AsyncMock()
    mock_repo.stop_recording.return_value = None
    mock_repo.list_summaries.return_value = []

    mock_settings = MagicMock()
    mock_settings.llm_provider = "mock"

    @asynccontextmanager
    async def fake_get_session():
        yield MagicMock()

    session = _make_session(mock_notify, recording_id=10)

    with (
        patch("src.services.orchestrator.get_session", side_effect=fake_get_session),
        patch("src.services.orchestrator.RecordingRepository", return_value=mock_repo),
        patch("src.services.orchestrator.get_settings", return_value=mock_settings),
        patch("src.services.orchestrator.create_classifier") as mock_cls,
    ):
        session.start()
        await session.stop()

    # Classifier should never be called
    mock_cls.assert_not_called()


# ---------------------------------------------------------------------------
# Classification — happy path (lines 266-298)
# ---------------------------------------------------------------------------


async def test_classify_recording_happy_path(mock_notify):
    """Full classification flow: summaries → classify → match template → persist."""
    # Create fake summary objects
    fake_summary_1 = MagicMock()
    fake_summary_1.summary_text = "Lecture about AI"
    fake_summary_2 = MagicMock()
    fake_summary_2.summary_text = "Deep learning concepts"

    mock_repo = AsyncMock()
    mock_repo.stop_recording.return_value = None
    mock_repo.list_summaries.return_value = [fake_summary_1, fake_summary_2]
    mock_repo.create_classification.return_value = None

    mock_settings = MagicMock()
    mock_settings.llm_provider = "mock"

    @asynccontextmanager
    async def fake_get_session():
        yield MagicMock()

    mock_classifier = AsyncMock()
    mock_classifier.classify.return_value = ClassificationResult(
        category="lecture",
        confidence=0.92,
        reason="Academic content about AI",
    )

    fake_template = MagicMock()
    fake_template.name = "lecture_note"
    fake_template.id = 1
    fake_template.display_name = "Lecture Note"
    fake_template.icon = "📚"

    mock_matcher_instance = AsyncMock()
    mock_matcher_instance.match.return_value = fake_template

    session = _make_session(mock_notify, recording_id=5)

    with (
        patch("src.services.orchestrator.get_session", side_effect=fake_get_session),
        patch("src.services.orchestrator.RecordingRepository", return_value=mock_repo),
        patch("src.services.orchestrator.get_settings", return_value=mock_settings),
        patch("src.services.orchestrator.create_llm"),
        patch("src.services.orchestrator.create_classifier", return_value=mock_classifier),
        patch("src.services.orchestrator.TemplateMatcher", return_value=mock_matcher_instance),
    ):
        session.start()
        await session.stop()

    mock_classifier.classify.assert_called_once()
    call_text = mock_classifier.classify.call_args[0][0]
    assert "Lecture about AI" in call_text
    assert "Deep learning concepts" in call_text

    mock_repo.create_classification.assert_called_once()
    call_kwargs = mock_repo.create_classification.call_args[1]
    assert call_kwargs["recording_id"] == 5
    assert call_kwargs["template_name"] == "lecture_note"
    assert call_kwargs["confidence"] == 0.92
    assert call_kwargs["end_minute"] == 1  # len(summaries) - 1


# ---------------------------------------------------------------------------
# Classification — failure is non-fatal (line 297-298)
# ---------------------------------------------------------------------------


async def test_classify_recording_failure_is_non_fatal(mock_notify):
    """If classification crashes, stop() should still complete."""
    fake_summary = MagicMock()
    fake_summary.summary_text = "Some content"

    mock_repo = AsyncMock()
    mock_repo.stop_recording.return_value = None
    mock_repo.list_summaries.return_value = [fake_summary]

    mock_settings = MagicMock()
    mock_settings.llm_provider = "mock"

    @asynccontextmanager
    async def fake_get_session():
        yield MagicMock()

    session = _make_session(mock_notify, recording_id=7)

    with (
        patch("src.services.orchestrator.get_session", side_effect=fake_get_session),
        patch("src.services.orchestrator.RecordingRepository", return_value=mock_repo),
        patch("src.services.orchestrator.get_settings", return_value=mock_settings),
        patch("src.services.orchestrator.create_llm", side_effect=RuntimeError("LLM unavailable")),
    ):
        session.start()
        await session.stop()  # Should not raise

    mock_repo.stop_recording.assert_called_once_with(7)


# ---------------------------------------------------------------------------
# stop_session() with no active session (line 341)
# ---------------------------------------------------------------------------


async def test_stop_session_no_active_is_noop():
    """stop_session() should be a no-op when no session is active."""
    orchestrator._active_session = None
    await orchestrator.stop_session()  # Should not raise
    assert orchestrator.get_active_session() is None
