"""
Summary REST endpoints.

Implements the list-summaries endpoint. Week 2 stubs
(hour-summaries, extract) remain as ``NotImplementedYetError``.
"""

from fastapi import APIRouter

from src.core.exceptions import NotImplementedYetError
from src.core.models import SummaryResponse
from src.services.storage.database import get_session
from src.services.storage.repository import RecordingRepository

router = APIRouter(prefix="/recordings", tags=["summaries"])


@router.get("/{recording_id}/summaries", response_model=list[SummaryResponse])
async def list_summaries(recording_id: int):
    """List 1-minute summaries for a recording."""
    async with get_session() as session:
        repo = RecordingRepository(session)
        # Verify recording exists (raises RecordingNotFoundError if not)
        await repo.get_recording(recording_id)
        summaries = await repo.list_summaries(recording_id)
    return [
        SummaryResponse(
            id=s.id,
            recording_id=s.recording_id,
            minute_index=s.minute_index,
            summary_text=s.summary_text,
            keywords=s.keywords or [],
            confidence=s.confidence,
            created_at=s.created_at,
        )
        for s in summaries
    ]


@router.get("/{recording_id}/hour-summaries")
async def list_hour_summaries(recording_id: int):
    """List hour-level summaries for a recording."""
    raise NotImplementedYetError("List hour summaries")


@router.post("/{recording_id}/extract")
async def extract_range(recording_id: int):
    """Cross-boundary range extraction and re-summarization."""
    raise NotImplementedYetError("Extract range")
