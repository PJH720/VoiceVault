"""
Pydantic v2 request / response models used across the API layer.

v0.1.0 — Recording, Summary, Transcription, WebSocket, Error
v0.2.0 — HourSummary, Classification, Template, RAG, CrossBoundary, Obsidian
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
    processing = "processing"
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
    audio_path: str | None = None


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------


class MinuteSummaryResult(BaseModel):
    """Internal service result from 1-minute summarization."""

    minute_index: int
    summary_text: str
    keywords: list[str] = Field(default_factory=list)
    topic: str = ""
    model_used: str = ""


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
    status = "status"
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


# ---------------------------------------------------------------------------
# v0.2.0 — Hour Summary
# ---------------------------------------------------------------------------


class HourSummaryResponse(BaseModel):
    """A single hour-level summary."""

    id: int
    recording_id: int
    hour_index: int
    summary_text: str
    keywords: list[str] = Field(default_factory=list)
    topic_segments: list[dict] = Field(default_factory=list)
    token_count: int = 0
    model_used: str = ""
    created_at: datetime


class HourSummaryResult(BaseModel):
    """Internal service result from hour-level summarization."""

    hour_index: int
    summary_text: str
    keywords: list[str] = Field(default_factory=list)
    topic_segments: list[dict] = Field(default_factory=list)
    token_count: int = 0
    model_used: str = ""


# ---------------------------------------------------------------------------
# v0.2.0 — Classification
# ---------------------------------------------------------------------------


class ClassificationResult(BaseModel):
    """Internal service result from zero-shot classification."""

    category: str
    confidence: float = 0.0
    reason: str = ""


class ClassificationResponse(BaseModel):
    """A classification result for a recording segment."""

    id: int
    recording_id: int
    template_name: str
    start_minute: int
    end_minute: int
    confidence: float = 0.0
    result: dict = Field(default_factory=dict)
    export_path: str | None = None
    created_at: datetime


# ---------------------------------------------------------------------------
# v0.2.0 — Template
# ---------------------------------------------------------------------------


class TemplateCreate(BaseModel):
    """POST /templates request body."""

    name: str
    display_name: str = ""
    triggers: list[str] = Field(default_factory=list)
    output_format: str = "markdown"
    fields: list[dict] = Field(default_factory=list)
    icon: str = ""
    priority: int = 0


class TemplateResponse(BaseModel):
    """Standard template representation returned by the API."""

    id: int
    name: str
    display_name: str = ""
    triggers: list[str] = Field(default_factory=list)
    output_format: str = "markdown"
    fields: list[dict] = Field(default_factory=list)
    icon: str = ""
    priority: int = 0
    is_default: bool = False
    is_active: bool = True
    created_at: datetime


# ---------------------------------------------------------------------------
# v0.2.0 — RAG
# ---------------------------------------------------------------------------


class RAGSource(BaseModel):
    """A single source reference within a RAG answer."""

    recording_id: int
    minute_index: int
    summary_text: str
    similarity: float
    date: str
    category: str = ""


class RAGQueryRequest(BaseModel):
    """POST /rag/query request body."""

    query: str = Field(max_length=2000)
    top_k: int = 5
    min_similarity: float = 0.3
    date_from: str | None = None
    date_to: str | None = None
    category: str | None = None
    keywords: list[str] | None = None


class RAGQueryResponse(BaseModel):
    """Response from a RAG search query."""

    answer: str
    sources: list[RAGSource] = Field(default_factory=list)
    model_used: str = ""
    query_time_ms: int = 0


# ---------------------------------------------------------------------------
# v0.2.0 — Cross-Boundary Extraction & Obsidian Export
# ---------------------------------------------------------------------------


class ExtractRangeRequest(BaseModel):
    """POST /recordings/{id}/extract request body."""

    start_minute: int
    end_minute: int


class ExtractRangeResponse(BaseModel):
    """Response from cross-boundary range extraction."""

    recording_id: int
    start_minute: int
    end_minute: int
    summary_text: str
    keywords: list[str] = Field(default_factory=list)
    included_minutes: list[int] = Field(default_factory=list)
    source_count: int = 0
    model_used: str = ""


class ObsidianExportRequest(BaseModel):
    """POST /recordings/{id}/export request body."""

    format: str = "obsidian"
    include_transcript: bool = False
    vault_path: str | None = None


class ObsidianExportResponse(BaseModel):
    """Response from an Obsidian Markdown export."""

    file_path: str
    markdown_content: str
    frontmatter: dict = Field(default_factory=dict)
