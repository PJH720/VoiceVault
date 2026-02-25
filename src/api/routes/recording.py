"""
Recording REST endpoints.

Implements CRUD operations for recording sessions, filesystem sync,
consistency checks, imported-recording processing, and Obsidian export.
All endpoints delegate to ``RecordingRepository`` — no business logic here.
"""

import logging
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from src.core.config import get_settings
from src.core.exceptions import VoiceVaultError
from src.core.models import (
    ClassificationResponse,
    ConsistencyResponse,
    DeleteRecordingResponse,
    ObsidianExportRequest,
    ObsidianExportResponse,
    ProcessRecordingResponse,
    RecordingCreate,
    RecordingResponse,
    RecordingStatus,
    SyncResponse,
)
from src.services import orchestrator
from src.services.storage.database import get_session
from src.services.storage.export import export_recording_to_markdown
from src.services.storage.repository import RecordingRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/recordings", tags=["recordings"])


def _to_response(recording) -> RecordingResponse:
    """Convert an ORM Recording object to its API response model.

    Args:
        recording: SQLAlchemy ORM ``Recording`` instance.

    Returns:
        RecordingResponse: Pydantic model suitable for JSON serialization.
    """
    return RecordingResponse(
        id=recording.id,
        title=recording.title,
        context=recording.context,
        status=RecordingStatus(recording.status),
        started_at=recording.started_at,
        ended_at=recording.ended_at,
        total_minutes=recording.total_minutes,
        audio_path=recording.audio_path,
    )


@router.post("", response_model=RecordingResponse)
async def create_recording(body: RecordingCreate | None = None):
    """Start a new recording session."""
    title = body.title if body else None
    context = body.context if body else None
    async with get_session() as session:
        repo = RecordingRepository(session)
        recording = await repo.create_recording(title=title, context=context)
    return _to_response(recording)


@router.get("", response_model=list[RecordingResponse])
async def list_recordings(
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List all recordings with optional filters."""
    async with get_session() as session:
        repo = RecordingRepository(session)
        recordings = await repo.list_recordings(status=status, limit=limit, offset=offset)
    return [_to_response(r) for r in recordings]


@router.post("/sync", response_model=SyncResponse)
async def sync_recordings():
    """Scan recordings directory and import unregistered audio files."""
    settings = get_settings()
    async with get_session() as session:
        repo = RecordingRepository(session)
        result = await repo.sync_from_filesystem(settings.recordings_dir)
    return result


@router.get("/consistency", response_model=ConsistencyResponse)
async def check_consistency():
    """Check DB ↔ filesystem consistency for orphan records/files."""
    settings = get_settings()
    async with get_session() as session:
        repo = RecordingRepository(session)
        result = await repo.check_consistency(settings.recordings_dir)
    return result


class CleanupRequest(BaseModel):
    """Request body for consistency cleanup actions."""

    action: str
    record_ids: list[int] = Field(default_factory=list)
    file_paths: list[str] = Field(default_factory=list)


class CleanupResponse(BaseModel):
    """Response from consistency cleanup."""

    processed: int = 0
    errors: list[str] = Field(default_factory=list)


@router.post("/consistency/cleanup", response_model=CleanupResponse)
async def consistency_cleanup(body: CleanupRequest):
    """Clean up orphan records or files discovered by consistency check.

    Supported actions:
    - ``delete_records``: Remove DB records with no audio file on disk.
    - ``delete_files``: Remove audio files with no matching DB record.
    - ``import_files``: Import orphan files into the DB via filesystem sync.

    Args:
        body: Action type and the record IDs or file paths to process.
    """
    settings = get_settings()
    # Resolve recordings dir for path-traversal prevention in delete_files
    rec_dir = Path(settings.recordings_dir).resolve()
    processed = 0
    errors: list[str] = []

    if body.action == "delete_records":
        async with get_session() as session:
            repo = RecordingRepository(session)
            for rid in body.record_ids:
                try:
                    await repo.delete_recording(rid)
                    processed += 1
                except Exception as exc:
                    errors.append(f"Recording {rid}: {exc}")

    elif body.action == "delete_files":
        for fp in body.file_paths:
            resolved = Path(fp).resolve()
            # Prevent path traversal: only allow deleting files inside recordings_dir
            if not str(resolved).startswith(str(rec_dir)):
                errors.append(f"{fp}: path outside recordings directory")
                continue
            try:
                resolved.unlink(missing_ok=True)
                processed += 1
            except OSError as exc:
                errors.append(f"{fp}: {exc}")

    elif body.action == "import_files":
        async with get_session() as session:
            repo = RecordingRepository(session)
            result = await repo.sync_from_filesystem(settings.recordings_dir)
            processed = result.get("new_imports", 0)
            errors = result.get("errors", [])

    else:
        raise VoiceVaultError(
            detail=f"Unknown cleanup action: {body.action}",
            code="INVALID_ACTION",
            status_code=400,
        )

    return CleanupResponse(processed=processed, errors=errors)


@router.delete("/{recording_id}", response_model=DeleteRecordingResponse)
async def delete_recording(recording_id: int):
    """Delete a recording and clean up associated files and vectors."""
    settings = get_settings()
    async with get_session() as session:
        repo = RecordingRepository(session)
        result = await repo.delete_recording_with_cleanup(
            recording_id=recording_id,
            recordings_dir=settings.recordings_dir,
            exports_dir=settings.exports_dir,
        )

    # Best-effort ChromaDB vector cleanup (non-fatal if ChromaDB is unavailable)
    minute_indices = result.pop("minute_indices", [])
    vectors_deleted = 0
    try:
        from src.services.rag import create_vectorstore

        vectorstore = create_vectorstore()
        ids_to_delete = [f"summary-{recording_id}-{idx}" for idx in minute_indices]
        if ids_to_delete:
            vectorstore.delete(ids=ids_to_delete)
            vectors_deleted = len(ids_to_delete)
    except Exception:
        logger.warning("Could not clean up vectors for recording %s", recording_id, exc_info=True)
    result["vectors_deleted"] = vectors_deleted

    return result


@router.get("/{recording_id}", response_model=RecordingResponse)
async def get_recording(recording_id: int):
    """Get details for a single recording."""
    async with get_session() as session:
        repo = RecordingRepository(session)
        recording = await repo.get_recording(recording_id)
    return _to_response(recording)


@router.get("/{recording_id}/audio")
async def get_recording_audio(recording_id: int):
    """Serve the WAV audio file for a recording."""
    async with get_session() as session:
        repo = RecordingRepository(session)
        recording = await repo.get_recording(recording_id)

    if not recording.audio_path:
        from src.core.exceptions import VoiceVaultError

        raise VoiceVaultError(
            detail=f"No audio file for recording {recording_id}",
            code="AUDIO_NOT_FOUND",
            status_code=404,
        )

    audio_path = Path(recording.audio_path)
    if not audio_path.is_file():
        from src.core.exceptions import VoiceVaultError

        raise VoiceVaultError(
            detail=f"Audio file not found on disk: {recording.audio_path}",
            code="AUDIO_NOT_FOUND",
            status_code=404,
        )

    ext = audio_path.suffix.lower()
    media_types = {
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".m4a": "audio/mp4",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
    }
    media_type = media_types.get(ext, "application/octet-stream")

    return FileResponse(
        path=audio_path,
        media_type=media_type,
        filename=f"recording-{recording_id}{ext}",
    )


@router.post("/{recording_id}/process", response_model=ProcessRecordingResponse)
async def process_recording(recording_id: int):
    """Process an imported recording: transcribe, summarize, and embed.

    Runs the full offline pipeline for recordings imported via filesystem sync
    (as opposed to live WebSocket recording). Steps:
    1. Validate the recording exists and has an audio file.
    2. Transcribe the entire audio file via faster-whisper.
    3. Group segments by minute and create per-minute transcripts.
    4. Summarize each minute and embed into ChromaDB.
    5. Finalize the recording status to "completed".

    Args:
        recording_id: ID of the imported recording to process.

    Raises:
        VoiceVaultError: If the recording is active, already processed, or missing audio.
    """
    # 1. Validate recording
    async with get_session() as session:
        repo = RecordingRepository(session)
        recording = await repo.get_recording(recording_id)

    if recording.status == "active":
        raise VoiceVaultError(
            detail="Cannot process an active recording. Stop it first.",
            code="RECORDING_ACTIVE",
            status_code=409,
        )

    # 2. Guard: reject if already has summaries
    async with get_session() as session:
        repo = RecordingRepository(session)
        existing = await repo.list_summaries(recording_id)
    if existing:
        raise VoiceVaultError(
            detail="Recording already has summaries. Delete them first to reprocess.",
            code="ALREADY_PROCESSED",
            status_code=409,
        )

    if not recording.audio_path:
        raise VoiceVaultError(
            detail="No audio file for this recording.",
            code="AUDIO_NOT_FOUND",
            status_code=404,
        )

    audio_path = Path(recording.audio_path)
    if not audio_path.is_file():
        raise VoiceVaultError(
            detail=f"Audio file not found on disk: {recording.audio_path}",
            code="AUDIO_NOT_FOUND",
            status_code=404,
        )

    # 3. Transcribe entire file
    from src.services.transcription.whisper import WhisperSTT

    stt = WhisperSTT()
    settings = get_settings()
    language = settings.whisper_default_language or None
    result = await stt.transcribe(str(audio_path), language=language)
    segments = result.get("segments", [])
    detected_language = result.get("language", "unknown")
    avg_confidence = result.get("confidence", 0.0)

    if not segments:
        raise VoiceVaultError(
            detail="Transcription produced no segments.",
            code="TRANSCRIPTION_EMPTY",
            status_code=422,
        )

    # 4. Group segments by minute
    minutes: dict[int, list[dict]] = defaultdict(list)
    for seg in segments:
        minute_index = int(seg["start"] // 60)
        minutes[minute_index].append(seg)

    # 5. Initialize summarizer and RAG pipeline
    from src.services.llm import create_llm
    from src.services.rag import create_embedding, create_vectorstore
    from src.services.summarization.minute_summarizer import MinuteSummarizer

    llm = create_llm(provider=settings.llm_provider)
    summarizer = MinuteSummarizer(llm)

    try:
        embedding = create_embedding(provider=settings.embedding_provider)
        vectorstore = create_vectorstore()
    except Exception:
        logger.warning("Failed to initialize RAG pipeline; embedding will be skipped")
        embedding = None
        vectorstore = None

    transcripts_created = 0
    summaries_created = 0
    embeddings_created = 0
    previous_context: str | None = None

    # 6. Process each minute
    for minute_index in sorted(minutes.keys()):
        segs = minutes[minute_index]
        text = " ".join(s["text"] for s in segs if s.get("text"))

        if not text.strip():
            continue

        # Create transcript
        async with get_session() as session:
            repo = RecordingRepository(session)
            await repo.create_transcript(
                recording_id=recording_id,
                minute_index=minute_index,
                text=text,
                confidence=avg_confidence,
                language=detected_language,
            )
        transcripts_created += 1

        # Summarize
        summary_result = await summarizer.summarize_minute(
            transcript=text,
            minute_index=minute_index,
            previous_context=previous_context,
            user_context=recording.context,
        )

        async with get_session() as session:
            repo = RecordingRepository(session)
            await repo.create_summary(
                recording_id=recording_id,
                minute_index=minute_index,
                summary_text=summary_result.summary_text,
                keywords=summary_result.keywords,
                model_used=settings.llm_provider,
                corrections=[c.model_dump() for c in summary_result.corrections],
            )
        summaries_created += 1
        previous_context = summary_result.summary_text

        # Embed into ChromaDB (non-fatal)
        if embedding is not None and vectorstore is not None:
            try:
                vector = await embedding.embed(summary_result.summary_text)
                doc_id = f"summary-{recording_id}-{minute_index}"
                metadata = {
                    "recording_id": recording_id,
                    "minute_index": minute_index,
                    "date": datetime.now(UTC).isoformat(),
                    "keywords": ",".join(summary_result.keywords)
                    if summary_result.keywords
                    else "",
                }
                await vectorstore.add(
                    doc_id=doc_id,
                    text=summary_result.summary_text,
                    embedding=vector,
                    metadata=metadata,
                )
                embeddings_created += 1
            except Exception:
                logger.warning(
                    "Failed to embed summary for recording=%s minute=%s (non-fatal)",
                    recording_id,
                    minute_index,
                )

    # 7. Finalize recording
    total_minutes = max(sorted(minutes.keys())[-1] + 1, 1) if minutes else 0
    async with get_session() as session:
        repo = RecordingRepository(session)
        rec = await repo.get_recording(recording_id)
        rec.total_minutes = total_minutes
        rec.status = "completed"
        rec.ended_at = datetime.now(UTC)
        await session.flush()

    return ProcessRecordingResponse(
        recording_id=recording_id,
        status="completed",
        total_minutes=total_minutes,
        transcripts_created=transcripts_created,
        summaries_created=summaries_created,
        embeddings_created=embeddings_created,
    )


@router.patch("/{recording_id}/stop", response_model=RecordingResponse)
async def stop_recording(recording_id: int):
    """Stop an active recording and trigger post-processing."""
    active = orchestrator.get_active_session()
    if active is not None and active.recording_id == recording_id:
        await orchestrator.stop_session()
    else:
        async with get_session() as session:
            repo = RecordingRepository(session)
            await repo.stop_recording(recording_id)

    async with get_session() as session:
        repo = RecordingRepository(session)
        recording = await repo.get_recording(recording_id)
    return _to_response(recording)


@router.get("/{recording_id}/classifications", response_model=list[ClassificationResponse])
async def get_classifications(recording_id: int):
    """Get classification results for a recording."""
    async with get_session() as session:
        repo = RecordingRepository(session)
        await repo.get_recording(recording_id)  # verify exists
        classifications = await repo.list_classifications(recording_id)
    return [
        ClassificationResponse(
            id=c.id,
            recording_id=c.recording_id,
            template_name=c.template_name,
            start_minute=c.start_minute,
            end_minute=c.end_minute,
            confidence=c.confidence,
            result=c.result_json or {},
            export_path=c.export_path,
            created_at=c.created_at,
        )
        for c in classifications
    ]


@router.post("/{recording_id}/export", response_model=ObsidianExportResponse)
async def export_recording(
    recording_id: int,
    body: ObsidianExportRequest | None = None,
):
    """Export recording as Obsidian-compatible Markdown.

    Generates a Markdown file with YAML frontmatter, template-driven sections,
    and optional ``[[wikilinks]]`` to related recordings discovered via RAG.

    Args:
        recording_id: ID of the recording to export.
        body: Optional export configuration (format, vault path, etc.).
    """
    # Build RAG retriever if wikilinks are enabled (for cross-recording links)
    retriever = None
    try:
        from src.core.config import get_settings

        settings = get_settings()
        if settings.obsidian_wikilinks:
            from src.services.llm import create_llm
            from src.services.rag import create_embedding, create_vectorstore
            from src.services.rag.retriever import RAGRetriever

            llm = create_llm(provider=settings.llm_provider)
            embedding = create_embedding(provider=settings.embedding_provider)
            vectorstore = create_vectorstore()
            retriever = RAGRetriever(llm=llm, embedding=embedding, vectorstore=vectorstore)
    except Exception:
        logger.warning("Could not initialize RAG retriever for wikilinks", exc_info=True)

    async with get_session() as session:
        result = await export_recording_to_markdown(
            recording_id=recording_id,
            request=body,
            session=session,
            retriever=retriever,
        )
    return result
