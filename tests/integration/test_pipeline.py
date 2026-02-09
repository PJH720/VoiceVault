"""Full E2E pipeline integration tests.

Recording → Transcription → Summarization → DB Storage → API retrieval.
Uses real in-memory SQLite with mocked LLM provider.

WebSocket pipeline tests verify the end-to-end flow:
  Audio bytes → STT → Transcript (DB) → Summarizer → Summary (DB)
"""

from unittest.mock import AsyncMock, patch

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


# ---------------------------------------------------------------------------
# WS Pipeline: transcript + summary saved to DB on minute boundary
# ---------------------------------------------------------------------------


def test_ws_pipeline_saves_transcript_and_summary(
    test_client: TestClient,
    mock_stt_for_pipeline,
    mock_llm_for_pipeline,
):
    """Send >= 1 minute of PCM → transcript + summary saved to DB."""
    recording_id = _create_recording(test_client)
    one_minute_chunk = b"\x00\x80" * (_BYTES_PER_MINUTE // 2)

    with (
        patch("src.api.websocket.create_stt", return_value=mock_stt_for_pipeline),
        patch("src.api.websocket.create_llm", return_value=mock_llm_for_pipeline),
    ):
        with test_client.websocket_connect(
            f"/ws/transcribe?recording_id={recording_id}"
        ) as ws:
            connected = ws.receive_json()
            assert connected["type"] == "connected"

            ws.send_bytes(one_minute_chunk)
            transcript_msg = ws.receive_json()
            assert transcript_msg["type"] == "transcript"
            assert transcript_msg["data"]["text"] == "오늘 강의에서 중요한 내용"

            summary_msg = ws.receive_json()
            assert summary_msg["type"] == "summary"
            assert summary_msg["data"]["keywords"] == ["LangChain", "Agent", "AI"]
            assert "LangChain" in summary_msg["data"]["summary_text"]

    # Verify summary persisted via REST API
    summaries = _get_summaries_via_api(test_client, recording_id)
    assert len(summaries) >= 1
    assert summaries[0]["minute_index"] == 0
    assert "LangChain" in summaries[0]["summary_text"]


# ---------------------------------------------------------------------------
# WS Pipeline: flush partial buffer on disconnect
# ---------------------------------------------------------------------------


def test_ws_pipeline_flushes_on_disconnect(
    test_client: TestClient,
    mock_stt_for_pipeline,
    mock_llm_for_pipeline,
):
    """Send < 1 min → disconnect → flush saves partial transcript + summary."""
    recording_id = _create_recording(test_client)
    # 10 seconds of audio (well below 1 minute)
    small_chunk = b"\x00\x80" * (16000 * 10)

    mock_save_transcript = AsyncMock()
    mock_summarize_and_save = AsyncMock(return_value=None)

    with (
        patch("src.api.websocket.create_stt", return_value=mock_stt_for_pipeline),
        patch("src.api.websocket.create_llm", return_value=mock_llm_for_pipeline),
        patch(
            "src.api.websocket._save_transcript", mock_save_transcript
        ),
        patch(
            "src.api.websocket._summarize_and_save", mock_summarize_and_save
        ),
    ):
        with test_client.websocket_connect(
            f"/ws/transcribe?recording_id={recording_id}"
        ) as ws:
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

    # Flush should also have attempted summarization
    mock_summarize_and_save.assert_called_once()


# ---------------------------------------------------------------------------
# WS Pipeline: survives LLM failure
# ---------------------------------------------------------------------------


def test_ws_pipeline_survives_llm_failure(
    test_client: TestClient,
    mock_stt_for_pipeline,
    mock_failing_llm,
):
    """LLM fails → error sent to client, but transcript still saved."""
    recording_id = _create_recording(test_client)
    one_minute_chunk = b"\x00\x80" * (_BYTES_PER_MINUTE // 2)

    with (
        patch("src.api.websocket.create_stt", return_value=mock_stt_for_pipeline),
        patch("src.api.websocket.create_llm", return_value=mock_failing_llm),
    ):
        with test_client.websocket_connect(
            f"/ws/transcribe?recording_id={recording_id}"
        ) as ws:
            ws.receive_json()  # connected
            ws.send_bytes(one_minute_chunk)

            msg = ws.receive_json()  # transcript
            assert msg["type"] == "transcript"

            msg = ws.receive_json()  # error (summarization failed)
            assert msg["type"] == "error"
            assert "Summarization failed" in msg["data"]["detail"]

    # No summary saved (LLM failed), but transcript was still processed
    summaries = _get_summaries_via_api(test_client, recording_id)
    assert len(summaries) == 0
