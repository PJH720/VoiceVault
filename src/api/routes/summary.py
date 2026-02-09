"""
Summary REST endpoints.

All routes are stubs that raise ``NotImplementedYetError`` (HTTP 501).
Real implementations will be added when the summarization service is ready.
"""

from fastapi import APIRouter

from src.core.exceptions import NotImplementedYetError

router = APIRouter(prefix="/recordings", tags=["summaries"])


@router.get("/{recording_id}/summaries")
async def list_summaries(recording_id: int):
    """List 1-minute summaries for a recording."""
    raise NotImplementedYetError("List summaries")


@router.get("/{recording_id}/hour-summaries")
async def list_hour_summaries(recording_id: int):
    """List hour-level summaries for a recording."""
    raise NotImplementedYetError("List hour summaries")


@router.post("/{recording_id}/extract")
async def extract_range(recording_id: int):
    """Cross-boundary range extraction and re-summarization."""
    raise NotImplementedYetError("Extract range")
