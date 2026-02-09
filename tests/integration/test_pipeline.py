"""Full E2E pipeline integration tests.

Recording → Transcription → Summarization → DB Storage → API retrieval.
Uses real in-memory SQLite with mocked LLM provider.
"""

from unittest.mock import AsyncMock

import pytest

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
