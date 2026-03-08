"""Unit tests for PluginAuthMiddleware."""

from unittest.mock import patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.api.middleware.plugin_auth import PluginAuthMiddleware


def _create_test_app() -> FastAPI:
    """Create a minimal FastAPI app with PluginAuthMiddleware."""
    app = FastAPI()
    app.add_middleware(PluginAuthMiddleware)

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/api/v1/health")
    async def health_v1():
        return {"status": "ok"}

    @app.get("/api/v1/recordings")
    async def recordings():
        return [{"id": 1}]

    @app.post("/api/v1/rag/query")
    async def rag_query():
        return {"answer": "test"}

    return app


class TestPluginAuthMiddlewareNoKey:
    """When plugin_api_key is empty, all requests should pass through."""

    @pytest.fixture
    def client(self):
        app = _create_test_app()
        transport = ASGITransport(app=app)
        return AsyncClient(transport=transport, base_url="http://test")

    @patch("src.api.middleware.plugin_auth.get_settings")
    async def test_no_key_allows_health(self, mock_settings, client):
        mock_settings.return_value.plugin_api_key = ""
        resp = await client.get("/health")
        assert resp.status_code == 200

    @patch("src.api.middleware.plugin_auth.get_settings")
    async def test_no_key_allows_api_v1(self, mock_settings, client):
        mock_settings.return_value.plugin_api_key = ""
        resp = await client.get("/api/v1/recordings")
        assert resp.status_code == 200

    @patch("src.api.middleware.plugin_auth.get_settings")
    async def test_no_key_allows_api_v1_without_header(self, mock_settings, client):
        mock_settings.return_value.plugin_api_key = ""
        resp = await client.post("/api/v1/rag/query")
        assert resp.status_code == 200


class TestPluginAuthMiddlewareWithKey:
    """When plugin_api_key is set, /api/v1/ routes require Bearer token."""

    @pytest.fixture
    def client(self):
        app = _create_test_app()
        transport = ASGITransport(app=app)
        return AsyncClient(transport=transport, base_url="http://test")

    @patch("src.api.middleware.plugin_auth.get_settings")
    async def test_valid_bearer_token_passes(self, mock_settings, client):
        mock_settings.return_value.plugin_api_key = "secret-key-123"
        resp = await client.get(
            "/api/v1/recordings",
            headers={"Authorization": "Bearer secret-key-123"},
        )
        assert resp.status_code == 200

    @patch("src.api.middleware.plugin_auth.get_settings")
    async def test_invalid_bearer_token_returns_401(self, mock_settings, client):
        mock_settings.return_value.plugin_api_key = "secret-key-123"
        resp = await client.get(
            "/api/v1/recordings",
            headers={"Authorization": "Bearer wrong-key"},
        )
        assert resp.status_code == 401
        data = resp.json()
        assert data["detail"] == "Invalid API key"
        assert data["code"] == "AUTH_REQUIRED"

    @patch("src.api.middleware.plugin_auth.get_settings")
    async def test_missing_auth_header_returns_401(self, mock_settings, client):
        mock_settings.return_value.plugin_api_key = "secret-key-123"
        resp = await client.get("/api/v1/recordings")
        assert resp.status_code == 401

    @patch("src.api.middleware.plugin_auth.get_settings")
    async def test_health_endpoint_skips_auth(self, mock_settings, client):
        mock_settings.return_value.plugin_api_key = "secret-key-123"
        resp = await client.get("/health")
        assert resp.status_code == 200

    @patch("src.api.middleware.plugin_auth.get_settings")
    async def test_api_v1_health_skips_auth(self, mock_settings, client):
        mock_settings.return_value.plugin_api_key = "secret-key-123"
        resp = await client.get("/api/v1/health")
        assert resp.status_code == 200

    @patch("src.api.middleware.plugin_auth.get_settings")
    async def test_non_bearer_prefix_returns_401(self, mock_settings, client):
        mock_settings.return_value.plugin_api_key = "secret-key-123"
        resp = await client.get(
            "/api/v1/recordings",
            headers={"Authorization": "Basic secret-key-123"},
        )
        assert resp.status_code == 401
