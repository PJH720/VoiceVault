"""
CRUD repository for all VoiceVault tables (Week 1 + Week 2).

``RecordingRepository`` receives an ``AsyncSession`` and provides all
data-access methods.  It calls ``flush()`` rather than ``commit()`` so
that transaction boundaries are controlled by the caller (typically
:func:`get_session`).
"""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.core.exceptions import RecordingNotFoundError, TemplateNotFoundError
from src.services.storage.models_db import (
    Classification,
    HourSummary,
    RAGQuery,
    Recording,
    Summary,
    Template,
    Transcript,
)


class RecordingRepository:
    """Data-access layer for the VoiceVault Week 1 + Week 2 schema."""

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
            # SQLite may return naive datetimes; ensure both sides match
            ended = recording.ended_at.replace(tzinfo=None)
            started = recording.started_at.replace(tzinfo=None)
            delta = ended - started
            recording.total_minutes = max(int(delta.total_seconds() // 60), 0)
        await self._session.flush()
        return recording

    async def update_recording_status(self, recording_id: int, status: str) -> Recording:
        """Update only the status field of a recording."""
        recording = await self.get_recording(recording_id)
        recording.status = status
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

    # ------------------------------------------------------------------
    # Hour Summaries (v0.2.0)
    # ------------------------------------------------------------------

    async def create_hour_summary(
        self,
        recording_id: int,
        hour_index: int,
        summary_text: str,
        keywords: list[str] | None = None,
        topic_segments: list[dict] | None = None,
        token_count: int = 0,
        model_used: str = "",
    ) -> HourSummary:
        """Create and return a new hour-level summary row."""
        hour_summary = HourSummary(
            recording_id=recording_id,
            hour_index=hour_index,
            summary_text=summary_text,
            keywords=keywords or [],
            topic_segments=topic_segments or [],
            token_count=token_count,
            model_used=model_used,
        )
        self._session.add(hour_summary)
        await self._session.flush()
        return hour_summary

    async def list_hour_summaries(self, recording_id: int) -> list[HourSummary]:
        """Return hour summaries for a recording ordered by *hour_index*."""
        stmt = (
            select(HourSummary)
            .where(HourSummary.recording_id == recording_id)
            .order_by(HourSummary.hour_index)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    # ------------------------------------------------------------------
    # Templates (v0.2.0)
    # ------------------------------------------------------------------

    async def create_template(
        self,
        name: str,
        display_name: str = "",
        triggers: list[str] | None = None,
        output_format: str = "markdown",
        fields: list[dict] | None = None,
        icon: str = "",
        priority: int = 0,
    ) -> Template:
        """Create and return a new template row."""
        template = Template(
            name=name,
            display_name=display_name,
            triggers=triggers or [],
            output_format=output_format,
            fields=fields or [],
            icon=icon,
            priority=priority,
        )
        self._session.add(template)
        await self._session.flush()
        return template

    async def get_template(self, template_id: int) -> Template:
        """Return a template by ID or raise :class:`TemplateNotFoundError`."""
        template = await self._session.get(Template, template_id)
        if template is None:
            raise TemplateNotFoundError(str(template_id))
        return template

    async def get_template_by_name(self, name: str) -> Template | None:
        """Return a template by unique name, or ``None`` if not found."""
        stmt = select(Template).where(Template.name == name)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_templates(self, active_only: bool = True) -> list[Template]:
        """Return templates ordered by *priority* descending."""
        stmt = select(Template).order_by(Template.priority.desc())
        if active_only:
            stmt = stmt.where(Template.is_active.is_(True))
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def update_template(self, template_id: int, **kwargs: object) -> Template:
        """Update template fields and return the updated row."""
        template = await self.get_template(template_id)
        for key, value in kwargs.items():
            if hasattr(template, key):
                setattr(template, key, value)
        await self._session.flush()
        return template

    async def delete_template(self, template_id: int) -> None:
        """Delete a template or raise :class:`TemplateNotFoundError`."""
        template = await self.get_template(template_id)
        await self._session.delete(template)
        await self._session.flush()

    # ------------------------------------------------------------------
    # Classifications (v0.2.0)
    # ------------------------------------------------------------------

    async def create_classification(
        self,
        recording_id: int,
        template_name: str,
        start_minute: int,
        end_minute: int,
        confidence: float = 0.0,
        result_json: dict | None = None,
        template_id: int | None = None,
        export_path: str | None = None,
    ) -> Classification:
        """Create and return a new classification row."""
        classification = Classification(
            recording_id=recording_id,
            template_name=template_name,
            start_minute=start_minute,
            end_minute=end_minute,
            confidence=confidence,
            result_json=result_json or {},
            template_id=template_id,
            export_path=export_path,
        )
        self._session.add(classification)
        await self._session.flush()
        return classification

    async def list_classifications(
        self, recording_id: int
    ) -> list[Classification]:
        """Return classifications for a recording ordered by *start_minute*."""
        stmt = (
            select(Classification)
            .where(Classification.recording_id == recording_id)
            .order_by(Classification.start_minute)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    # ------------------------------------------------------------------
    # RAG Queries (v0.2.0)
    # ------------------------------------------------------------------

    async def create_rag_query(
        self,
        query_text: str,
        results_json: list | None = None,
        model_used: str = "",
        answer_text: str = "",
        sources: list | None = None,
    ) -> RAGQuery:
        """Create and return a new RAG query log row."""
        rag_query = RAGQuery(
            query_text=query_text,
            results_json=results_json or [],
            model_used=model_used,
            answer_text=answer_text,
            sources=sources or [],
        )
        self._session.add(rag_query)
        await self._session.flush()
        return rag_query

    async def list_rag_queries(self, limit: int = 50) -> list[RAGQuery]:
        """Return RAG queries ordered by *created_at* descending."""
        stmt = (
            select(RAGQuery)
            .order_by(RAGQuery.created_at.desc())
            .limit(limit)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())
