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
    """Possible states for a recording session.

    Lifecycle: active -> processing -> completed | failed
    Imported recordings start directly as "imported".
    """

    active = "active"  # Currently recording audio
    processing = "processing"  # Post-recording summarization in progress
    completed = "completed"  # All summaries and classification finished
    failed = "failed"  # An error occurred during processing
    imported = "imported"  # Created from an imported audio file, not live recording


class RecordingCreate(BaseModel):
    """POST /recordings request body (optional fields)."""

    title: str | None = None
    context: str | None = Field(None, max_length=500)


class RecordingResponse(BaseModel):
    """Standard recording representation returned by the API."""

    id: int
    title: str | None = None
    context: str | None = None
    status: RecordingStatus
    started_at: datetime
    ended_at: datetime | None = None
    total_minutes: int = 0
    audio_path: str | None = None


class SyncResponse(BaseModel):
    """Response from filesystem → DB sync operation."""

    scanned: int = 0
    new_imports: int = 0
    already_exists: int = 0
    errors: list[str] = Field(default_factory=list)


class ProcessRecordingResponse(BaseModel):
    """Response from processing an imported recording."""

    recording_id: int
    status: str = "completed"
    total_minutes: int = 0
    transcripts_created: int = 0
    summaries_created: int = 0
    embeddings_created: int = 0


# ---------------------------------------------------------------------------
# Consistency Check & Delete
# ---------------------------------------------------------------------------


class OrphanRecord(BaseModel):
    """A DB recording whose audio file is missing from disk."""

    id: int
    title: str | None = None
    status: str
    audio_path: str | None = None
    started_at: datetime


class OrphanFile(BaseModel):
    """An audio file on disk with no matching DB record."""

    file_path: str
    file_name: str
    size_bytes: int = 0
    modified_at: datetime | None = None


class ConsistencyResponse(BaseModel):
    """Response from DB ↔ filesystem consistency check."""

    total_db_records: int = 0
    total_fs_files: int = 0
    orphan_records: list[OrphanRecord] = Field(default_factory=list)
    orphan_files: list[OrphanFile] = Field(default_factory=list)
    healthy_count: int = 0


class DeleteRecordingResponse(BaseModel):
    """Response from recording deletion with file cleanup."""

    recording_id: int
    db_deleted: bool = True
    audio_deleted: bool = False
    exports_deleted: int = 0
    vectors_deleted: int = 0


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------


class TranscriptionCorrection(BaseModel):
    """A single STT error correction made by the LLM summarizer."""

    original: str
    corrected: str
    reason: str = ""


class MinuteSummaryResult(BaseModel):
    """Internal service result from 1-minute summarization.

    Produced by ``MinuteSummarizer`` and consumed by the orchestrator to
    persist summaries and queue embedding creation.
    """

    minute_index: int  # Zero-based minute offset within the recording
    summary_text: str  # Concise summary (~50 tokens target)
    keywords: list[str] = Field(default_factory=list)  # Extracted key terms
    topic: str = ""  # Short topic label
    model_used: str = ""  # LLM model identifier for provenance tracking
    corrections: list[TranscriptionCorrection] = Field(default_factory=list)


class SummaryResponse(BaseModel):
    """A single 1-minute summary."""

    id: int
    recording_id: int
    minute_index: int
    summary_text: str
    keywords: list[str] = Field(default_factory=list)
    confidence: float = 0.0
    corrections: list[TranscriptionCorrection] = Field(default_factory=list)
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
    """Discriminator for messages sent over the transcription WebSocket.

    Used as the ``type`` field in ``WebSocketMessage`` to let the client
    route incoming server-push messages to the correct UI handler.
    """

    connected = "connected"  # Initial handshake confirmation
    transcript = "transcript"  # Real-time STT text segment
    summary = "summary"  # 1-minute summary just produced
    status = "status"  # Recording state change (e.g. processing → completed)
    error = "error"  # Error during transcription or summarization


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
    """Internal service result from hour-level summarization.

    Produced by the 3-level hierarchical compression pipeline:
    60 one-minute summaries -> 6 ten-minute groups -> 1 hour summary.
    Achieves ~95% token reduction compared to raw transcripts.
    """

    hour_index: int  # Zero-based hour offset within the recording
    summary_text: str  # Compressed hour-level summary
    keywords: list[str] = Field(default_factory=list)
    topic_segments: list[dict] = Field(default_factory=list)  # Topic shifts within the hour
    token_count: int = 0  # Approximate token count for cost tracking
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
    """POST /rag/query request body.

    Supports natural-language queries with optional metadata filters
    for date range, category, and keyword narrowing.
    """

    query: str = Field(max_length=2000)  # Natural-language search question
    top_k: int = 5  # Max number of similar summaries to retrieve
    min_similarity: float = 0.3  # Cosine similarity cutoff (0.0–1.0)
    date_from: str | None = None  # ISO date string for range start (inclusive)
    date_to: str | None = None  # ISO date string for range end (inclusive)
    category: str | None = None  # Filter by classification category
    keywords: list[str] | None = None  # Required keywords in source summaries


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
    """POST /recordings/{id}/extract request body.

    Allows users to select any arbitrary minute range for re-summarization.
    The range can span hour boundaries transparently.
    """

    start_minute: int  # Inclusive start minute (zero-based)
    end_minute: int  # Inclusive end minute


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
