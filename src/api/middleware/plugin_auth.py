"""
Plugin authentication middleware for Obsidian Plugin API requests.

Validates ``Authorization: Bearer <key>`` headers on ``/api/v1/`` routes
when ``settings.plugin_api_key`` is configured. Skips authentication for
WebSocket, health, and docs endpoints.
"""

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from src.core.config import get_settings


class PluginAuthMiddleware(BaseHTTPMiddleware):
    """Enforce Bearer token auth on /api/v1/ routes when plugin_api_key is set."""

    _SKIP_PREFIXES = ("/health", "/docs", "/openapi.json", "/redoc", "/ws/")

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        settings = get_settings()

        # If no API key configured, allow all requests through
        if not settings.plugin_api_key:
            return await call_next(request)

        path = request.url.path

        # Only enforce auth on /api/v1/ paths
        if not path.startswith("/api/v1/"):
            return await call_next(request)

        # Skip health endpoint under /api/v1/
        if path == "/api/v1/health":
            return await call_next(request)

        # Skip paths that should never require auth
        for prefix in self._SKIP_PREFIXES:
            if path.startswith(prefix):
                return await call_next(request)

        # Validate Authorization header
        auth_header = request.headers.get("authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid API key", "code": "AUTH_REQUIRED"},
            )

        token = auth_header[len("Bearer ") :]
        if token != settings.plugin_api_key:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid API key", "code": "AUTH_REQUIRED"},
            )

        return await call_next(request)
