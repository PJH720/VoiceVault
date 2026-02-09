"""
Pydantic v2 request / response models used across the API layer.

Only models needed for the current milestone (v0.1.0) are defined here.
Additional models will be added as features are implemented.
"""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


class HealthResponse(BaseModel):
    """GET /health response."""

    status: str = "ok"
    version: str = "0.1.0"
    timestamp: datetime


# ---------------------------------------------------------------------------
# Recording
# ---------------------------------------------------------------------------


class RecordingStatus(StrEnum):
    """Possible states for a recording session."""

    active = "active"
    completed = "completed"
    failed = "failed"


class RecordingCreate(BaseModel):
    """POST /recordings request body (optional fields)."""

    title: str | None = None


class RecordingResponse(BaseModel):
    """Standard recording representation returned by the API."""

    id: int
    title: str | None = None
    status: RecordingStatus
    started_at: datetime
    ended_at: datetime | None = None
    total_minutes: int = 0


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------


class SummaryResponse(BaseModel):
    """A single 1-minute summary."""

    id: int
    recording_id: int
    minute_index: int
    summary_text: str
    keywords: list[str] = Field(default_factory=list)
    confidence: float = 0.0
    created_at: datetime


# ---------------------------------------------------------------------------
# Transcription
# ---------------------------------------------------------------------------


class TranscriptionSegment(BaseModel):
    """A single transcription segment with timestamps."""

    text: str
    start: float
    end: float
    avg_logprob: float = 0.0
    no_speech_prob: float = 0.0


class TranscriptionResult(BaseModel):
    """Complete transcription result from a file."""

    text: str
    language: str = "unknown"
    language_probability: float = 0.0
    confidence: float = 0.0
    duration: float = 0.0
    segments: list[TranscriptionSegment] = Field(default_factory=list)


class StreamingTranscriptionResult(BaseModel):
    """Transcription result from a streaming chunk."""

    text: str
    is_final: bool = False
    confidence: float = 0.0
    segments: list[TranscriptionSegment] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------


class WebSocketMessageType(StrEnum):
    """Discriminator for messages sent over the transcription WebSocket."""

    connected = "connected"
    transcript = "transcript"
    summary = "summary"
    error = "error"


class WebSocketMessage(BaseModel):
    """JSON message sent from server to client over WebSocket."""

    type: WebSocketMessageType
    data: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Error
# ---------------------------------------------------------------------------


class ErrorResponse(BaseModel):
    """Standard error envelope returned by the API."""

    detail: str
    code: str
    timestamp: str
