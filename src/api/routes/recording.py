"""
Recording REST endpoints.

Implements CRUD operations for recording sessions and Obsidian export.
"""

import logging
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
    """Convert an ORM Recording to a RecordingResponse."""
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
    """Clean up orphan records or files discovered by consistency check."""
    settings = get_settings()
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

    # Best-effort ChromaDB vector cleanup
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

    return FileResponse(
        path=audio_path,
        media_type="audio/wav",
        filename=f"recording-{recording_id}.wav",
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
    """Export recording as Obsidian-compatible Markdown."""
    # Build RAG retriever if wikilinks are enabled
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
