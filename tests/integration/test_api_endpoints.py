"""Integration tests for REST API endpoints with real in-memory SQLite."""

import pytest

from src.services.storage import database
from src.services.storage.repository import RecordingRepository

# ---------------------------------------------------------------------------
# Recording lifecycle
# ---------------------------------------------------------------------------


async def test_recording_lifecycle(async_client):
    """POST create → GET by id → GET list → PATCH stop: full lifecycle."""
    # Create
    resp = await async_client.post("/api/v1/recordings", json={"title": "Integration Test"})
    assert resp.status_code == 200
    body = resp.json()
    rec_id = body["id"]
    assert body["title"] == "Integration Test"
    assert body["status"] == "active"
    assert body["ended_at"] is None

    # Get by ID
    resp = await async_client.get(f"/api/v1/recordings/{rec_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == rec_id
    assert resp.json()["status"] == "active"

    # List (should contain our recording)
    resp = await async_client.get("/api/v1/recordings")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert any(r["id"] == rec_id for r in data)

    # Stop
    resp = await async_client.patch(f"/api/v1/recordings/{rec_id}/stop")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "completed"
    assert body["ended_at"] is not None

    # Verify stopped state persists
    resp = await async_client.get(f"/api/v1/recordings/{rec_id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"


# ---------------------------------------------------------------------------
# Recording with summaries (data inserted via repository)
# ---------------------------------------------------------------------------


async def test_recording_with_summaries(async_client):
    """Create recording via API, insert transcript+summary via repo, verify via API."""
    # Create recording via API
    resp = await async_client.post("/api/v1/recordings", json={"title": "Summary Test"})
    rec_id = resp.json()["id"]

    # Insert transcript and summary directly via repository
    async with database.get_session() as session:
        repo = RecordingRepository(session)
        await repo.create_transcript(
            recording_id=rec_id,
            minute_index=0,
            text="오늘은 AI 강의를 들었습니다.",
            confidence=0.92,
            language="ko",
        )
        await repo.create_summary(
            recording_id=rec_id,
            minute_index=0,
            summary_text="AI 강의 요약",
            keywords=["AI", "강의"],
            confidence=0.85,
            model_used="test-model",
        )

    # Verify summaries via API
    resp = await async_client.get(f"/api/v1/recordings/{rec_id}/summaries")
    assert resp.status_code == 200
    summaries = resp.json()
    assert len(summaries) == 1
    s = summaries[0]
    assert s["recording_id"] == rec_id
    assert s["minute_index"] == 0
    assert s["summary_text"] == "AI 강의 요약"
    assert s["keywords"] == ["AI", "강의"]
    assert s["confidence"] == 0.85


# ---------------------------------------------------------------------------
# 404 error cases
# ---------------------------------------------------------------------------


async def test_recording_not_found_returns_404(async_client):
    """GET /recordings/9999 returns 404 with RECORDING_NOT_FOUND code."""
    resp = await async_client.get("/api/v1/recordings/9999")
    assert resp.status_code == 404
    body = resp.json()
    assert body["code"] == "RECORDING_NOT_FOUND"
    assert "9999" in body["detail"]


async def test_stop_nonexistent_recording_returns_404(async_client):
    """PATCH /recordings/9999/stop returns 404."""
    resp = await async_client.patch("/api/v1/recordings/9999/stop")
    assert resp.status_code == 404
    body = resp.json()
    assert body["code"] == "RECORDING_NOT_FOUND"


# ---------------------------------------------------------------------------
# Status filtering
# ---------------------------------------------------------------------------


async def test_list_recordings_with_status_filter(async_client):
    """Create active + stopped recordings, filter by status."""
    # Create two recordings
    resp1 = await async_client.post("/api/v1/recordings", json={"title": "Active Rec"})
    rec1_id = resp1.json()["id"]

    resp2 = await async_client.post("/api/v1/recordings", json={"title": "Completed Rec"})
    rec2_id = resp2.json()["id"]

    # Stop the second one
    await async_client.patch(f"/api/v1/recordings/{rec2_id}/stop")

    # Filter by active
    resp = await async_client.get("/api/v1/recordings", params={"status": "active"})
    assert resp.status_code == 200
    active_ids = [r["id"] for r in resp.json()]
    assert rec1_id in active_ids
    assert rec2_id not in active_ids

    # Filter by completed
    resp = await async_client.get("/api/v1/recordings", params={"status": "completed"})
    assert resp.status_code == 200
    completed_ids = [r["id"] for r in resp.json()]
    assert rec2_id in completed_ids
    assert rec1_id not in completed_ids


# ---------------------------------------------------------------------------
# Summary response schema validation
# ---------------------------------------------------------------------------


async def test_summary_response_schema(async_client):
    """Verify SummaryResponse contains all expected fields with correct types."""
    # Create recording and insert a summary
    resp = await async_client.post("/api/v1/recordings")
    rec_id = resp.json()["id"]

    async with database.get_session() as session:
        repo = RecordingRepository(session)
        await repo.create_summary(
            recording_id=rec_id,
            minute_index=0,
            summary_text="Schema test summary",
            keywords=["test", "schema"],
            confidence=0.9,
            model_used="test-model",
        )

    resp = await async_client.get(f"/api/v1/recordings/{rec_id}/summaries")
    assert resp.status_code == 200
    summaries = resp.json()
    assert len(summaries) == 1

    s = summaries[0]
    # Verify all SummaryResponse fields are present
    assert isinstance(s["id"], int)
    assert isinstance(s["recording_id"], int)
    assert isinstance(s["minute_index"], int)
    assert isinstance(s["summary_text"], str)
    assert isinstance(s["keywords"], list)
    assert isinstance(s["confidence"], float)
    assert isinstance(s["created_at"], str)  # ISO datetime string

    # Verify values
    assert s["recording_id"] == rec_id
    assert s["minute_index"] == 0
    assert s["summary_text"] == "Schema test summary"
    assert s["keywords"] == ["test", "schema"]
    assert s["confidence"] == pytest.approx(0.9)


# ---------------------------------------------------------------------------
# Recording context field
# ---------------------------------------------------------------------------


async def test_create_recording_with_context(async_client):
    """POST /recordings with context should persist and return it."""
    resp = await async_client.post(
        "/api/v1/recordings",
        json={"title": "AI Lecture", "context": "LangChain, RAG, Agent"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["context"] == "LangChain, RAG, Agent"

    # Verify GET returns context too
    rec_id = body["id"]
    resp = await async_client.get(f"/api/v1/recordings/{rec_id}")
    assert resp.status_code == 200
    assert resp.json()["context"] == "LangChain, RAG, Agent"


async def test_create_recording_without_context(async_client):
    """POST /recordings without context should return null."""
    resp = await async_client.post("/api/v1/recordings", json={"title": "No Context"})
    assert resp.status_code == 200
    assert resp.json()["context"] is None


# ---------------------------------------------------------------------------
# Summary corrections field
# ---------------------------------------------------------------------------


async def test_summary_with_corrections(async_client):
    """Summaries with corrections should include them in the API response."""
    resp = await async_client.post("/api/v1/recordings")
    rec_id = resp.json()["id"]

    async with database.get_session() as session:
        repo = RecordingRepository(session)
        await repo.create_summary(
            recording_id=rec_id,
            minute_index=0,
            summary_text="LangChain discussion",
            corrections=[
                {"original": "랭체인", "corrected": "LangChain", "reason": "STT error"},
            ],
        )

    resp = await async_client.get(f"/api/v1/recordings/{rec_id}/summaries")
    assert resp.status_code == 200
    summaries = resp.json()
    assert len(summaries) == 1
    s = summaries[0]
    assert isinstance(s["corrections"], list)
    assert len(s["corrections"]) == 1
    assert s["corrections"][0]["original"] == "랭체인"
    assert s["corrections"][0]["corrected"] == "LangChain"


async def test_summary_without_corrections(async_client):
    """Summaries without corrections should return empty list."""
    resp = await async_client.post("/api/v1/recordings")
    rec_id = resp.json()["id"]

    async with database.get_session() as session:
        repo = RecordingRepository(session)
        await repo.create_summary(
            recording_id=rec_id,
            minute_index=0,
            summary_text="Normal summary",
        )

    resp = await async_client.get(f"/api/v1/recordings/{rec_id}/summaries")
    assert resp.status_code == 200
    assert resp.json()[0]["corrections"] == []
