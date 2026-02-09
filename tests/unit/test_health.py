"""Tests for health check, CORS headers, implemented routes, and stub 501 responses."""

import pytest
from httpx import ASGITransport, AsyncClient

from src.api.app import create_app
from src.services.storage import database


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
async def client(app, db_engine):
    """AsyncClient that injects the test in-memory engine into the database module."""
    # Inject the test engine so routes use in-memory SQLite with tables created
    database._engine = db_engine
    database._session_factory = None  # force re-creation from new engine
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    database.reset_engine()


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


async def test_health_returns_200(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["version"] == "0.1.0"
    assert "timestamp" in body


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------


async def test_cors_allows_streamlit_origin(client):
    resp = await client.options(
        "/health",
        headers={
            "Origin": "http://localhost:8501",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:8501"


async def test_cors_rejects_unknown_origin(client):
    resp = await client.options(
        "/health",
        headers={
            "Origin": "http://evil.example.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert "access-control-allow-origin" not in resp.headers


# ---------------------------------------------------------------------------
# Implemented recording routes
# ---------------------------------------------------------------------------


async def test_create_recording(client):
    resp = await client.post("/api/v1/recordings", json={"title": "Test"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "Test"
    assert body["status"] == "active"
    assert "id" in body


async def test_list_recordings_empty(client):
    resp = await client.get("/api/v1/recordings")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_list_recordings_returns_created(client):
    await client.post("/api/v1/recordings", json={"title": "Rec 1"})
    resp = await client.get("/api/v1/recordings")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == "Rec 1"


async def test_get_recording(client):
    create_resp = await client.post("/api/v1/recordings")
    rec_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/recordings/{rec_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == rec_id


async def test_get_recording_not_found(client):
    resp = await client.get("/api/v1/recordings/9999")
    assert resp.status_code == 404


async def test_stop_recording(client):
    create_resp = await client.post("/api/v1/recordings")
    rec_id = create_resp.json()["id"]
    resp = await client.patch(f"/api/v1/recordings/{rec_id}/stop")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "completed"
    assert body["ended_at"] is not None


async def test_list_summaries_empty(client):
    create_resp = await client.post("/api/v1/recordings")
    rec_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/recordings/{rec_id}/summaries")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_list_summaries_recording_not_found(client):
    resp = await client.get("/api/v1/recordings/9999/summaries")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Stub endpoints still return 501
# ---------------------------------------------------------------------------


async def test_list_hour_summaries_returns_501(client):
    resp = await client.get("/api/v1/recordings/1/hour-summaries")
    assert resp.status_code == 501


async def test_extract_range_returns_501(client):
    resp = await client.post("/api/v1/recordings/1/extract")
    assert resp.status_code == 501


async def test_get_classifications_not_found(client):
    resp = await client.get("/api/v1/recordings/9999/classifications")
    assert resp.status_code == 404


async def test_get_classifications_empty(client):
    create_resp = await client.post("/api/v1/recordings")
    rec_id = create_resp.json()["id"]
    resp = await client.get(f"/api/v1/recordings/{rec_id}/classifications")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_export_recording_returns_501(client):
    resp = await client.post("/api/v1/recordings/1/export")
    assert resp.status_code == 501
