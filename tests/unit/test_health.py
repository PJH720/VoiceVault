"""Tests for the health check, CORS headers, and stub endpoint 501 responses."""

import pytest
from httpx import ASGITransport, AsyncClient

from src.api.app import create_app


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
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


@pytest.mark.asyncio
async def test_cors_allows_streamlit_origin(client):
    resp = await client.options(
        "/health",
        headers={
            "Origin": "http://localhost:8501",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:8501"


@pytest.mark.asyncio
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
# Stub endpoints return 501
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_recordings_returns_501(client):
    resp = await client.get("/api/v1/recordings")
    assert resp.status_code == 501
    body = resp.json()
    assert body["code"] == "NOT_IMPLEMENTED"


@pytest.mark.asyncio
async def test_create_recording_returns_501(client):
    resp = await client.post("/api/v1/recordings")
    assert resp.status_code == 501


@pytest.mark.asyncio
async def test_get_recording_returns_501(client):
    resp = await client.get("/api/v1/recordings/1")
    assert resp.status_code == 501


@pytest.mark.asyncio
async def test_stop_recording_returns_501(client):
    resp = await client.patch("/api/v1/recordings/1/stop")
    assert resp.status_code == 501


@pytest.mark.asyncio
async def test_list_summaries_returns_501(client):
    resp = await client.get("/api/v1/recordings/1/summaries")
    assert resp.status_code == 501


@pytest.mark.asyncio
async def test_list_hour_summaries_returns_501(client):
    resp = await client.get("/api/v1/recordings/1/hour-summaries")
    assert resp.status_code == 501


@pytest.mark.asyncio
async def test_extract_range_returns_501(client):
    resp = await client.post("/api/v1/recordings/1/extract")
    assert resp.status_code == 501


@pytest.mark.asyncio
async def test_get_classifications_returns_501(client):
    resp = await client.get("/api/v1/recordings/1/classifications")
    assert resp.status_code == 501


@pytest.mark.asyncio
async def test_export_recording_returns_501(client):
    resp = await client.post("/api/v1/recordings/1/export")
    assert resp.status_code == 501
