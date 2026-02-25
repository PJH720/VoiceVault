"""
FastAPI application factory.

``create_app()`` assembles the application with CORS, error handlers,
routers, and the health endpoint. The module-level ``app`` instance
allows ``uvicorn src.api.app:app --reload``.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api import websocket
from src.api.middleware.error_handler import register_error_handlers
from src.api.middleware.plugin_auth import PluginAuthMiddleware
from src.api.routes import rag, recording, summary, template
from src.core.config import get_settings
from src.core.models import HealthResponse
from src.services import orchestrator
from src.services.storage.database import close_db, init_db


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Manage application startup and shutdown lifecycle.

    Startup: initialize the async SQLite database (create tables if needed).
    Shutdown: drain any active orchestrator sessions, then dispose the DB engine.
    """
    await init_db()
    yield
    # Graceful shutdown: finish pending summarization before closing DB
    await orchestrator.cleanup()
    await close_db()


def create_app() -> FastAPI:
    """Build and return a fully configured FastAPI application.

    Assembles CORS middleware, error handlers, REST routers, and
    the WebSocket transcription endpoint into a single FastAPI instance.

    Returns:
        FastAPI: The configured application, ready for ``uvicorn``.
    """

    app = FastAPI(
        title="VoiceVault",
        description="AI-powered voice recorder with transcription, "
        "summarization, and classification.",
        version="0.1.0",
        lifespan=lifespan,
    )

    # -- CORS --
    settings = get_settings()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # -- Plugin Auth Middleware --
    app.add_middleware(PluginAuthMiddleware)

    # -- Error handlers --
    register_error_handlers(app)

    # -- Health check (root-level, not under /api/v1) --
    @app.get("/health", response_model=HealthResponse, tags=["system"])
    async def health() -> HealthResponse:
        return HealthResponse(timestamp=datetime.now(UTC))

    # -- Health check (versioned, for Obsidian Plugin) --
    @app.get("/api/v1/health", response_model=HealthResponse, tags=["system"])
    async def health_v1() -> HealthResponse:
        return HealthResponse(timestamp=datetime.now(UTC))

    # -- REST routes --
    app.include_router(recording.router, prefix="/api/v1")
    app.include_router(summary.router, prefix="/api/v1")
    app.include_router(rag.router, prefix="/api/v1")
    app.include_router(template.router, prefix="/api/v1")

    # -- WebSocket --
    app.include_router(websocket.router)

    return app


app = create_app()
