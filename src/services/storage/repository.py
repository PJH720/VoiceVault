"""
CRUD repository for recordings, transcripts, and summaries.

``RecordingRepository`` receives an ``AsyncSession`` and provides all
data-access methods.  It calls ``flush()`` rather than ``commit()`` so
that transaction boundaries are controlled by the caller (typically
:func:`get_session`).
"""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.core.exceptions import RecordingNotFoundError
from src.services.storage.models_db import Recording, Summary, Transcript


class RecordingRepository:
    """Data-access layer for the VoiceVault Week 1 schema."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ------------------------------------------------------------------
    # Recordings
    # ------------------------------------------------------------------

    async def create_recording(
        self,
        title: str | None = None,
        audio_path: str | None = None,
    ) -> Recording:
        """Create and return a new recording with status *active*."""
        recording = Recording(title=title, audio_path=audio_path)
        self._session.add(recording)
        await self._session.flush()
        return recording

    async def get_recording(self, recording_id: int) -> Recording:
        """Return a recording by ID or raise :class:`RecordingNotFoundError`."""
        stmt = (
            select(Recording)
            .where(Recording.id == recording_id)
            .options(
                selectinload(Recording.transcripts),
                selectinload(Recording.summaries),
            )
        )
        result = await self._session.execute(stmt)
        recording = result.scalar_one_or_none()
        if recording is None:
            raise RecordingNotFoundError(recording_id)
        return recording

    async def list_recordings(
        self,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Recording]:
        """Return recordings, optionally filtered by *status*."""
        stmt = select(Recording).order_by(Recording.id.desc()).limit(limit).offset(offset)
        if status is not None:
            stmt = stmt.where(Recording.status == status)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def stop_recording(self, recording_id: int) -> Recording:
        """Mark a recording as *completed* and compute *total_minutes*."""
        recording = await self.get_recording(recording_id)
        recording.status = "completed"
        recording.ended_at = datetime.now(UTC)
        if recording.started_at:
            delta = recording.ended_at - recording.started_at
            recording.total_minutes = max(int(delta.total_seconds() // 60), 0)
        await self._session.flush()
        return recording

    async def delete_recording(self, recording_id: int) -> None:
        """Delete a recording and cascade to transcripts/summaries."""
        recording = await self.get_recording(recording_id)
        await self._session.delete(recording)
        await self._session.flush()

    # ------------------------------------------------------------------
    # Transcripts
    # ------------------------------------------------------------------

    async def create_transcript(
        self,
        recording_id: int,
        minute_index: int,
        text: str,
        confidence: float = 0.0,
        language: str = "unknown",
    ) -> Transcript:
        """Create and return a new transcript row."""
        transcript = Transcript(
            recording_id=recording_id,
            minute_index=minute_index,
            text=text,
            confidence=confidence,
            language=language,
        )
        self._session.add(transcript)
        await self._session.flush()
        return transcript

    async def list_transcripts(self, recording_id: int) -> list[Transcript]:
        """Return transcripts for a recording ordered by *minute_index*."""
        stmt = (
            select(Transcript)
            .where(Transcript.recording_id == recording_id)
            .order_by(Transcript.minute_index)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    # ------------------------------------------------------------------
    # Summaries
    # ------------------------------------------------------------------

    async def create_summary(
        self,
        recording_id: int,
        minute_index: int,
        summary_text: str,
        keywords: list[str] | None = None,
        speakers: list[str] | None = None,
        confidence: float = 0.0,
        model_used: str = "",
    ) -> Summary:
        """Create and return a new summary row."""
        summary = Summary(
            recording_id=recording_id,
            minute_index=minute_index,
            summary_text=summary_text,
            keywords=keywords or [],
            speakers=speakers or [],
            confidence=confidence,
            model_used=model_used,
        )
        self._session.add(summary)
        await self._session.flush()
        return summary

    async def list_summaries(self, recording_id: int) -> list[Summary]:
        """Return summaries for a recording ordered by *minute_index*."""
        stmt = (
            select(Summary)
            .where(Summary.recording_id == recording_id)
            .order_by(Summary.minute_index)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def list_summaries_in_range(
        self,
        recording_id: int,
        start_minute: int,
        end_minute: int,
    ) -> list[Summary]:
        """Return summaries in ``[start_minute, end_minute]`` inclusive."""
        stmt = (
            select(Summary)
            .where(
                Summary.recording_id == recording_id,
                Summary.minute_index >= start_minute,
                Summary.minute_index <= end_minute,
            )
            .order_by(Summary.minute_index)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_summary(self, summary_id: int) -> Summary | None:
        """Return a summary by ID, or ``None`` if not found."""
        return await self._session.get(Summary, summary_id)
