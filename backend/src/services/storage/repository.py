"""
CRUD repository for all VoiceVault tables (Week 1 + Week 2).

``RecordingRepository`` receives an ``AsyncSession`` and provides all
data-access methods.  It calls ``flush()`` rather than ``commit()`` so
that transaction boundaries are controlled by the caller (typically
:func:`get_session`).
"""

import logging
from datetime import UTC, datetime
from pathlib import Path

from pydub import AudioSegment
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.core.exceptions import RecordingNotFoundError, TemplateNotFoundError, VoiceVaultError
from src.services.storage.models_db import (
    Classification,
    HourSummary,
    RAGQuery,
    Recording,
    Summary,
    Template,
    Transcript,
)

logger = logging.getLogger(__name__)


def _get_audio_duration_minutes(file_path: Path) -> int:
    """Return audio duration in minutes (minimum 1) using pydub.

    Args:
        file_path: Path to the audio file.

    Returns:
        Duration in whole minutes (minimum 1), or 0 if the file cannot be read.
    """
    try:
        audio = AudioSegment.from_file(str(file_path))
        return max(int(len(audio) / 1000 / 60), 1)
    except Exception:
        return 0


class RecordingRepository:
    """Data-access layer for the VoiceVault schema.

    All methods use ``flush()`` instead of ``commit()`` so transaction
    boundaries are controlled by the caller (typically ``get_session()``
    context manager which commits on clean exit).

    Args:
        session: An active SQLAlchemy ``AsyncSession``.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ------------------------------------------------------------------
    # Recordings
    # ------------------------------------------------------------------

    async def create_recording(
        self,
        title: str | None = None,
        audio_path: str | None = None,
        context: str | None = None,
    ) -> Recording:
        """Create and return a new recording with status *active*."""
        recording = Recording(title=title, audio_path=audio_path, context=context)
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
        """Mark a recording as *completed* and compute *total_minutes*.

        Args:
            recording_id: The recording to finalize.

        Returns:
            The updated Recording with status="completed" and computed duration.
        """
        recording = await self.get_recording(recording_id)
        recording.status = "completed"
        recording.ended_at = datetime.now(UTC)
        if recording.started_at:
            # SQLite may return naive datetimes; strip tzinfo for safe subtraction
            ended = recording.ended_at.replace(tzinfo=None)
            started = recording.started_at.replace(tzinfo=None)
            delta = ended - started
            recording.total_minutes = max(int(delta.total_seconds() // 60), 0)
        await self._session.flush()
        return recording

    async def update_audio_path(self, recording_id: int, audio_path: str) -> Recording:
        """Set the audio_path for a recording after WAV file is saved."""
        recording = await self.get_recording(recording_id)
        recording.audio_path = audio_path
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

    async def sync_from_filesystem(self, recordings_dir: str) -> dict:
        """Scan *recordings_dir* for audio files not yet in DB and import them.

        Returns a dict with keys: ``scanned``, ``new_imports``,
        ``already_exists``, ``errors``.
        """
        AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".flac"}

        rec_dir = Path(recordings_dir)
        if not rec_dir.is_dir():
            return {"scanned": 0, "new_imports": 0, "already_exists": 0, "errors": []}

        # Collect existing audio_path values from DB
        stmt = select(Recording.audio_path).where(Recording.audio_path.isnot(None))
        result = await self._session.execute(stmt)
        existing_paths: set[str] = {str(Path(p).resolve()) for (p,) in result.all() if p}

        scanned = 0
        new_imports = 0
        already_exists = 0
        errors: list[str] = []

        for entry in rec_dir.iterdir():
            if not entry.is_file():
                continue
            if entry.suffix.lower() not in AUDIO_EXTENSIONS:
                continue

            scanned += 1
            abs_path = str(entry.resolve())

            if abs_path in existing_paths:
                already_exists += 1
                continue

            try:
                title = entry.stem.replace("_", " ").replace("-", " ")
                mtime = datetime.fromtimestamp(entry.stat().st_mtime, tz=UTC)
                recording = Recording(
                    title=title,
                    audio_path=abs_path,
                    status="imported",
                    started_at=mtime,
                    total_minutes=_get_audio_duration_minutes(entry),
                )
                self._session.add(recording)
                new_imports += 1
            except Exception as exc:
                errors.append(f"{entry.name}: {exc}")

        if new_imports:
            await self._session.flush()

        return {
            "scanned": scanned,
            "new_imports": new_imports,
            "already_exists": already_exists,
            "errors": errors,
        }

    async def check_consistency(self, recordings_dir: str) -> dict:
        """Cross-reference DB records with filesystem audio files.

        Returns a dict matching ``ConsistencyResponse`` shape with
        orphan records (DB rows with missing files) and orphan files
        (disk files with no DB record).
        """
        AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".flac"}

        rec_dir = Path(recordings_dir)

        # 1) DB records with non-null audio_path
        stmt = select(Recording).where(Recording.audio_path.isnot(None))
        result = await self._session.execute(stmt)
        db_recordings = list(result.scalars().all())

        # Build lookup: resolved path → recording
        db_path_map: dict[str, Recording] = {}
        for rec in db_recordings:
            if rec.audio_path:
                db_path_map[str(Path(rec.audio_path).resolve())] = rec

        # 2) Filesystem audio files
        fs_paths: dict[str, Path] = {}
        if rec_dir.is_dir():
            for entry in rec_dir.iterdir():
                if entry.is_file() and entry.suffix.lower() in AUDIO_EXTENSIONS:
                    fs_paths[str(entry.resolve())] = entry

        # 3) Cross-reference
        orphan_records = []
        healthy_count = 0
        for abs_path, rec in db_path_map.items():
            if abs_path in fs_paths:
                healthy_count += 1
            else:
                orphan_records.append(
                    {
                        "id": rec.id,
                        "title": rec.title,
                        "status": rec.status,
                        "audio_path": rec.audio_path,
                        "started_at": rec.started_at,
                    }
                )

        orphan_files = []
        for abs_path, entry in fs_paths.items():
            if abs_path not in db_path_map:
                try:
                    stat = entry.stat()
                    size = stat.st_size
                    mtime = datetime.fromtimestamp(stat.st_mtime, tz=UTC)
                except OSError:
                    size = 0
                    mtime = None
                orphan_files.append(
                    {
                        "file_path": str(entry),
                        "file_name": entry.name,
                        "size_bytes": size,
                        "modified_at": mtime,
                    }
                )

        return {
            "total_db_records": len(db_recordings),
            "total_fs_files": len(fs_paths),
            "orphan_records": orphan_records,
            "orphan_files": orphan_files,
            "healthy_count": healthy_count,
        }

    async def delete_recording_with_cleanup(
        self,
        recording_id: int,
        recordings_dir: str,
        exports_dir: str,
    ) -> dict:
        """Delete a recording from DB and clean up associated files.

        Returns a dict matching ``DeleteRecordingResponse`` shape plus
        ``minute_indices`` for optional vector store cleanup by the caller.
        """
        # Load recording with relationships
        stmt = (
            select(Recording)
            .where(Recording.id == recording_id)
            .options(
                selectinload(Recording.summaries),
                selectinload(Recording.classifications),
            )
        )
        result = await self._session.execute(stmt)
        recording = result.scalar_one_or_none()
        if recording is None:
            raise RecordingNotFoundError(recording_id)

        if recording.status == "active":
            raise VoiceVaultError(
                detail="Cannot delete an active recording. Stop it first.",
                code="RECORDING_ACTIVE",
                status_code=409,
            )

        # Collect paths and indices BEFORE DB delete
        audio_path = recording.audio_path
        export_paths = [c.export_path for c in recording.classifications if c.export_path]
        minute_indices = [s.minute_index for s in recording.summaries]

        # DB cascade delete
        await self._session.delete(recording)
        await self._session.flush()

        # Filesystem cleanup
        audio_deleted = False
        if audio_path:
            try:
                Path(audio_path).unlink(missing_ok=True)
                audio_deleted = True
            except OSError as exc:
                logger.warning("Failed to delete audio %s: %s", audio_path, exc)

        exports_deleted = 0
        for ep in export_paths:
            try:
                Path(ep).unlink(missing_ok=True)
                exports_deleted += 1
            except OSError as exc:
                logger.warning("Failed to delete export %s: %s", ep, exc)

        return {
            "recording_id": recording_id,
            "db_deleted": True,
            "audio_deleted": audio_deleted,
            "exports_deleted": exports_deleted,
            "vectors_deleted": 0,
            "minute_indices": minute_indices,
        }

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
        corrections: list[dict] | None = None,
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
            corrections=corrections or [],
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

    async def list_classifications(self, recording_id: int) -> list[Classification]:
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
        stmt = select(RAGQuery).order_by(RAGQuery.created_at.desc()).limit(limit)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())
