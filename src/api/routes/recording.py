"""
Recording REST endpoints.

Implements CRUD operations for recording sessions. Week 2 stubs
(classifications, export) remain as ``NotImplementedYetError``.
"""

from fastapi import APIRouter, Query

from src.core.exceptions import NotImplementedYetError
from src.core.models import RecordingCreate, RecordingResponse, RecordingStatus
from src.services.storage.database import get_session
from src.services.storage.repository import RecordingRepository

router = APIRouter(prefix="/recordings", tags=["recordings"])


def _to_response(recording) -> RecordingResponse:
    """Convert an ORM Recording to a RecordingResponse."""
    return RecordingResponse(
        id=recording.id,
        title=recording.title,
        status=RecordingStatus(recording.status),
        started_at=recording.started_at,
        ended_at=recording.ended_at,
        total_minutes=recording.total_minutes,
    )


@router.post("", response_model=RecordingResponse)
async def create_recording(body: RecordingCreate | None = None):
    """Start a new recording session."""
    title = body.title if body else None
    async with get_session() as session:
        repo = RecordingRepository(session)
        recording = await repo.create_recording(title=title)
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


@router.get("/{recording_id}", response_model=RecordingResponse)
async def get_recording(recording_id: int):
    """Get details for a single recording."""
    async with get_session() as session:
        repo = RecordingRepository(session)
        recording = await repo.get_recording(recording_id)
    return _to_response(recording)


@router.patch("/{recording_id}/stop", response_model=RecordingResponse)
async def stop_recording(recording_id: int):
    """Stop an active recording and trigger post-processing."""
    async with get_session() as session:
        repo = RecordingRepository(session)
        recording = await repo.stop_recording(recording_id)
    return _to_response(recording)


@router.get("/{recording_id}/classifications")
async def get_classifications(recording_id: int):
    """Get classification results for a recording."""
    raise NotImplementedYetError("Get classifications")


@router.post("/{recording_id}/export")
async def export_recording(recording_id: int):
    """Export recording as Obsidian-compatible Markdown."""
    raise NotImplementedYetError("Export recording")
