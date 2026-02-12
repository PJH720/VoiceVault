"""
Global error handling middleware for the FastAPI application.

Catches VoiceVaultError subclasses, Pydantic validation errors, and
unhandled exceptions, converting them into a consistent JSON envelope.
"""

from datetime import UTC, datetime

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from src.core.exceptions import VoiceVaultError


def register_error_handlers(app: FastAPI) -> None:
    """Attach exception handlers to the FastAPI application.

    Registers three handlers in priority order:
    1. ``VoiceVaultError`` — maps domain errors to structured JSON responses.
    2. ``RequestValidationError`` — Pydantic validation failures (422).
    3. ``Exception`` — catch-all for unexpected server errors (500).

    Args:
        app: The FastAPI application instance to register handlers on.
    """

    @app.exception_handler(VoiceVaultError)
    async def voicevault_error_handler(_request: Request, exc: VoiceVaultError) -> JSONResponse:
        """Convert domain-specific errors into a JSON error envelope."""
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "detail": exc.detail,
                "code": exc.code,
                "timestamp": exc.timestamp,
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        """Handle Pydantic request validation errors (malformed body/params)."""
        return JSONResponse(
            status_code=422,
            content={
                "detail": str(exc),
                "code": "VALIDATION_ERROR",
                "timestamp": datetime.now(UTC).isoformat(),
            },
        )

    @app.exception_handler(Exception)
    async def generic_error_handler(_request: Request, _exc: Exception) -> JSONResponse:
        """Catch-all handler — prevents stack traces from leaking to clients."""
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Internal server error",
                "code": "INTERNAL_ERROR",
                "timestamp": datetime.now(UTC).isoformat(),
            },
        )
