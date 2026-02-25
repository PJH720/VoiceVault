"""Full E2E pipeline integration tests.

Recording → Transcription → Summarization → DB Storage → API retrieval.
Uses real in-memory SQLite with mocked LLM provider.

WebSocket pipeline tests verify the end-to-end flow:
  Audio bytes → STT → Transcript (DB) → Orchestrator → Summary (DB)
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from starlette.testclient import TestClient

from src.api.websocket import _BYTES_PER_MINUTE
from src.core.exceptions import SummarizationError
from src.core.models import MinuteSummaryResult
from src.services.llm.base import BaseLLM
from src.services.storage import database
from src.services.storage.repository import RecordingRepository
from src.services.summarization.minute_summarizer import MinuteSummarizer

# ---------------------------------------------------------------------------
# Full pipeline
# ---------------------------------------------------------------------------


async def test_full_pipeline(async_client, mock_llm_for_pipeline, sample_transcript_data):
    """Create recording → insert transcript → summarize → save → verify via API."""
    # 1. Create recording via API
    resp = await async_client.post("/api/v1/recordings", json={"title": "Full Pipeline Test"})
    assert resp.status_code == 200
    rec_id = resp.json()["id"]

    # 2. Insert transcript via repository
    segment = sample_transcript_data["segments"][0]
    async with database.get_session() as session:
        repo = RecordingRepository(session)
        await repo.create_transcript(
            recording_id=rec_id,
            minute_index=segment["minute_index"],
            text=segment["text"],
            confidence=segment["confidence"],
            language=segment["language"],
        )

    # 3. Summarize with MinuteSummarizer + mock LLM
    summarizer = MinuteSummarizer(llm=mock_llm_for_pipeline)
    result = await summarizer.summarize_minute(
        transcript=segment["text"],
        minute_index=segment["minute_index"],
    )

    assert isinstance(result, MinuteSummaryResult)
    assert result.minute_index == 0
    assert result.summary_text != ""
    assert len(result.keywords) > 0

    # 4. Save summary to DB via repository
    async with database.get_session() as session:
        repo = RecordingRepository(session)
        await repo.create_summary(
            recording_id=rec_id,
            minute_index=result.minute_index,
            summary_text=result.summary_text,
            keywords=result.keywords,
            confidence=0.85,
            model_used="mock-llm",
        )

    # 5. Verify via API GET /summaries
    resp = await async_client.get(f"/api/v1/recordings/{rec_id}/summaries")
    assert resp.status_code == 200
    summaries = resp.json()
    assert len(summaries) == 1
    assert summaries[0]["summary_text"] == result.summary_text
    assert summaries[0]["keywords"] == result.keywords

    # 6. Stop recording and verify status
    resp = await async_client.patch(f"/api/v1/recordings/{rec_id}/stop")
    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"


# ---------------------------------------------------------------------------
# Empty transcript handling
# ---------------------------------------------------------------------------


async def test_pipeline_with_empty_transcript(async_client, mock_llm_for_pipeline):
    """Empty transcript returns empty result — no LLM call made."""
    # Create recording
    resp = await async_client.post("/api/v1/recordings", json={"title": "Empty Test"})
    rec_id = resp.json()["id"]

    # Summarize empty transcript
    summarizer = MinuteSummarizer(llm=mock_llm_for_pipeline)
    result = await summarizer.summarize_minute(transcript="", minute_index=0)

    # Empty result, no LLM call
    assert result.summary_text == ""
    assert result.keywords == []
    assert result.topic == ""
    mock_llm_for_pipeline.generate.assert_not_called()

    # Save empty summary to DB
    async with database.get_session() as session:
        repo = RecordingRepository(session)
        await repo.create_summary(
            recording_id=rec_id,
            minute_index=0,
            summary_text=result.summary_text,
            keywords=result.keywords,
        )

    # Verify stored consistently
    resp = await async_client.get(f"/api/v1/recordings/{rec_id}/summaries")
    assert resp.status_code == 200
    summaries = resp.json()
    assert len(summaries) == 1
    assert summaries[0]["summary_text"] == ""
    assert summaries[0]["keywords"] == []


# ---------------------------------------------------------------------------
# Error recovery
# ---------------------------------------------------------------------------


async def test_pipeline_error_recovery(async_client, sample_transcript_data):
    """LLM failure raises SummarizationError; recording and transcript survive."""
    # Create recording
    resp = await async_client.post("/api/v1/recordings", json={"title": "Error Test"})
    rec_id = resp.json()["id"]

    # Insert transcript
    segment = sample_transcript_data["segments"][1]
    async with database.get_session() as session:
        repo = RecordingRepository(session)
        await repo.create_transcript(
            recording_id=rec_id,
            minute_index=segment["minute_index"],
            text=segment["text"],
            confidence=segment["confidence"],
            language=segment["language"],
        )

    # Mock LLM that raises ConnectionError
    failing_llm = AsyncMock(spec=BaseLLM)
    failing_llm.generate.side_effect = ConnectionError("LLM service unavailable")

    summarizer = MinuteSummarizer(llm=failing_llm)
    with pytest.raises(SummarizationError, match="LLM call failed"):
        await summarizer.summarize_minute(
            transcript=segment["text"],
            minute_index=segment["minute_index"],
        )

    # Recording is still accessible
    resp = await async_client.get(f"/api/v1/recordings/{rec_id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"

    # Summaries endpoint works (empty, since summarization failed)
    resp = await async_client.get(f"/api/v1/recordings/{rec_id}/summaries")
    assert resp.status_code == 200
    assert resp.json() == []


# ===========================================================================
# WebSocket pipeline integration tests
# ===========================================================================


def _create_recording(client: TestClient) -> int:
    """POST /api/v1/recordings and return the ID."""
    resp = client.post("/api/v1/recordings")
    assert resp.status_code == 200
    return resp.json()["id"]


def _get_summaries_via_api(client: TestClient, recording_id: int) -> list[dict]:
    """Fetch summaries via the REST API."""
    resp = client.get(f"/api/v1/recordings/{recording_id}/summaries")
    assert resp.status_code == 200
    return resp.json()


def _make_mock_session():
    """Create a mock RecordingSession for the orchestrator."""
    session = MagicMock()
    session.recording_id = 1
    session.enqueue_transcript = MagicMock()
    return session


# ---------------------------------------------------------------------------
# WS Pipeline: transcript saved to DB + enqueued to orchestrator on boundary
# ---------------------------------------------------------------------------


def test_ws_pipeline_saves_transcript_and_enqueues(
    test_client: TestClient,
    mock_stt_for_pipeline,
):
    """Send >= 1 minute of PCM → transcript saved to DB + enqueued to orchestrator."""
    recording_id = _create_recording(test_client)
    one_minute_chunk = b"\x00\x80" * (_BYTES_PER_MINUTE // 2)

    mock_session = _make_mock_session()

    with (
        patch("src.api.websocket.create_stt", return_value=mock_stt_for_pipeline),
        patch(
            "src.api.websocket.orchestrator.start_session",
            new_callable=AsyncMock,
            return_value=mock_session,
        ),
        patch("src.api.websocket.orchestrator.stop_session", new_callable=AsyncMock),
    ):
        with test_client.websocket_connect(f"/ws/transcribe?recording_id={recording_id}") as ws:
            connected = ws.receive_json()
            assert connected["type"] == "connected"

            ws.send_bytes(one_minute_chunk)
            transcript_msg = ws.receive_json()
            assert transcript_msg["type"] == "transcript"
            assert transcript_msg["data"]["text"] == "오늘 강의에서 중요한 내용"

            # Send a small follow-up chunk so the server processes the
            # minute boundary from the previous iteration before we close.
            ws.send_bytes(b"\x00" * 64)
            followup = ws.receive_json()
            assert followup["type"] == "transcript"

    # Verify transcript enqueued to orchestrator
    mock_session.enqueue_transcript.assert_called_once_with(0, "오늘 강의에서 중요한 내용")


# ---------------------------------------------------------------------------
# WS Pipeline: flush partial buffer on disconnect
# ---------------------------------------------------------------------------


def test_ws_pipeline_flushes_on_disconnect(
    test_client: TestClient,
    mock_stt_for_pipeline,
):
    """Send < 1 min → disconnect → flush saves partial transcript + enqueues."""
    recording_id = _create_recording(test_client)
    # 10 seconds of audio (well below 1 minute)
    small_chunk = b"\x00\x80" * (16000 * 10)

    mock_session = _make_mock_session()
    mock_save_transcript = AsyncMock()

    with (
        patch("src.api.websocket.create_stt", return_value=mock_stt_for_pipeline),
        patch(
            "src.api.websocket.orchestrator.start_session",
            new_callable=AsyncMock,
            return_value=mock_session,
        ),
        patch("src.api.websocket.orchestrator.stop_session", new_callable=AsyncMock),
        patch("src.api.websocket._save_transcript", mock_save_transcript),
    ):
        with test_client.websocket_connect(f"/ws/transcribe?recording_id={recording_id}") as ws:
            ws.receive_json()  # connected
            ws.send_bytes(small_chunk)
            ws.receive_json()  # transcript
            # Close without reaching minute boundary — triggers flush

    # Flush should have called _save_transcript for the partial minute
    mock_save_transcript.assert_called_once()
    call_args = mock_save_transcript.call_args
    assert call_args[0][0] == recording_id  # recording_id
    assert call_args[0][1] == 0  # minute_index
    assert "중요한 내용" in call_args[0][2]  # text

    # Flush should also have enqueued to orchestrator
    mock_session.enqueue_transcript.assert_called_once()


# ---------------------------------------------------------------------------
# WS Pipeline: orchestrator stop called on disconnect
# ---------------------------------------------------------------------------


def test_ws_pipeline_starts_orchestrator_session(
    test_client: TestClient,
    mock_stt_for_pipeline,
):
    """WebSocket handler should start an orchestrator session on connect."""
    recording_id = _create_recording(test_client)
    small_chunk = b"\x00\x80" * (16000 * 5)

    mock_session = _make_mock_session()
    mock_start = AsyncMock(return_value=mock_session)

    with (
        patch("src.api.websocket.create_stt", return_value=mock_stt_for_pipeline),
        patch("src.api.websocket.orchestrator.start_session", mock_start),
        patch("src.api.websocket.orchestrator.stop_session", new_callable=AsyncMock),
    ):
        with test_client.websocket_connect(f"/ws/transcribe?recording_id={recording_id}") as ws:
            ws.receive_json()  # connected
            ws.send_bytes(small_chunk)
            ws.receive_json()  # transcript

    # Verify orchestrator.start_session was called with the recording_id
    mock_start.assert_called_once()
    call_kwargs = mock_start.call_args
    assert call_kwargs[1].get("recording_id") or call_kwargs[0][0] == recording_id
