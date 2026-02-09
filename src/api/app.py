"""
FastAPI application factory.

``create_app()`` assembles the application with CORS, error handlers,
routers, and the health endpoint. The module-level ``app`` instance
allows ``uvicorn src.api.app:app --reload``.
"""

from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api import websocket
from src.api.middleware.error_handler import register_error_handlers
from src.api.routes import recording, summary
from src.core.models import HealthResponse


def create_app() -> FastAPI:
    """Build and return a fully configured FastAPI application."""

    app = FastAPI(
        title="VoiceVault",
        description="AI-powered voice recorder with transcription, "
        "summarization, and classification.",
        version="0.1.0",
    )

    # -- CORS --
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:8501",  # Streamlit
            "http://localhost:3000",  # Dev frontend
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # -- Error handlers --
    register_error_handlers(app)

    # -- Health check (root-level, not under /api/v1) --
    @app.get("/health", response_model=HealthResponse, tags=["system"])
    async def health() -> HealthResponse:
        return HealthResponse(timestamp=datetime.now(UTC))

    # -- REST routes --
    app.include_router(recording.router, prefix="/api/v1")
    app.include_router(summary.router, prefix="/api/v1")

    # -- WebSocket --
    app.include_router(websocket.router)

    return app


app = create_app()
