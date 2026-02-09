"""
Recording REST endpoints.

All routes are stubs that raise ``NotImplementedYetError`` (HTTP 501).
Real implementations will be added when the storage layer is ready.
"""

from fastapi import APIRouter

from src.core.exceptions import NotImplementedYetError
from src.core.models import RecordingCreate

router = APIRouter(prefix="/recordings", tags=["recordings"])


@router.post("")
async def create_recording(body: RecordingCreate | None = None):
    """Start a new recording session."""
    raise NotImplementedYetError("Create recording")


@router.get("")
async def list_recordings():
    """List all recordings with optional filters."""
    raise NotImplementedYetError("List recordings")


@router.get("/{recording_id}")
async def get_recording(recording_id: int):
    """Get details for a single recording."""
    raise NotImplementedYetError("Get recording")


@router.patch("/{recording_id}/stop")
async def stop_recording(recording_id: int):
    """Stop an active recording and trigger post-processing."""
    raise NotImplementedYetError("Stop recording")


@router.get("/{recording_id}/classifications")
async def get_classifications(recording_id: int):
    """Get classification results for a recording."""
    raise NotImplementedYetError("Get classifications")


@router.post("/{recording_id}/export")
async def export_recording(recording_id: int):
    """Export recording as Obsidian-compatible Markdown."""
    raise NotImplementedYetError("Export recording")
