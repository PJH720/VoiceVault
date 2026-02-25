"""
SQLAlchemy ORM models for the VoiceVault Week 1 + Week 2 schema.

Tables: ``recordings``, ``transcripts``, ``summaries``,
``hour_summaries``, ``templates``, ``classifications``, ``rag_queries``.
"""

from datetime import UTC, datetime

from sqlalchemy import Boolean, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from src.services.storage.database import Base


class Recording(Base):
    """A single recording session.

    Central entity in the data model. Has one-to-many relationships with
    transcripts, summaries, hour summaries, and classifications.
    Cascade delete ensures all child records are removed when a recording is deleted.
    """

    __tablename__ = "recordings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    context: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))
    ended_at: Mapped[datetime | None] = mapped_column(nullable=True)
    audio_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    total_minutes: Mapped[int] = mapped_column(default=0)

    transcripts: Mapped[list["Transcript"]] = relationship(
        back_populates="recording",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    summaries: Mapped[list["Summary"]] = relationship(
        back_populates="recording",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    hour_summaries: Mapped[list["HourSummary"]] = relationship(
        back_populates="recording",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    classifications: Mapped[list["Classification"]] = relationship(
        back_populates="recording",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Recording id={self.id} status={self.status!r}>"


class Transcript(Base):
    """A 1-minute transcription segment."""

    __tablename__ = "transcripts"
    __table_args__ = (Index("ix_transcripts_recording_minute", "recording_id", "minute_index"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    recording_id: Mapped[int] = mapped_column(ForeignKey("recordings.id"))
    minute_index: Mapped[int] = mapped_column()
    text: Mapped[str] = mapped_column(Text, default="")
    confidence: Mapped[float] = mapped_column(default=0.0)
    language: Mapped[str] = mapped_column(String(10), default="unknown")
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))

    recording: Mapped["Recording"] = relationship(back_populates="transcripts")

    def __repr__(self) -> str:
        return f"<Transcript id={self.id} recording={self.recording_id} minute={self.minute_index}>"


class Summary(Base):
    """A 1-minute LLM summary."""

    __tablename__ = "summaries"
    __table_args__ = (Index("ix_summaries_recording_minute", "recording_id", "minute_index"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    recording_id: Mapped[int] = mapped_column(ForeignKey("recordings.id"))
    minute_index: Mapped[int] = mapped_column()
    summary_text: Mapped[str] = mapped_column(Text, default="")
    keywords: Mapped[list] = mapped_column(JSON, default=list)
    speakers: Mapped[list] = mapped_column(JSON, default=list)
    confidence: Mapped[float] = mapped_column(default=0.0)
    model_used: Mapped[str] = mapped_column(String(100), default="")
    corrections: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))

    recording: Mapped["Recording"] = relationship(back_populates="summaries")

    def __repr__(self) -> str:
        return f"<Summary id={self.id} recording={self.recording_id} minute={self.minute_index}>"


# ===================================================================
# Week 2 — v0.2.0 tables
# ===================================================================


class HourSummary(Base):
    """Hierarchical hour-level summary aggregated from 1-minute summaries."""

    __tablename__ = "hour_summaries"
    __table_args__ = (Index("ix_hour_summaries_recording_hour", "recording_id", "hour_index"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    recording_id: Mapped[int] = mapped_column(ForeignKey("recordings.id"))
    hour_index: Mapped[int] = mapped_column()
    summary_text: Mapped[str] = mapped_column(Text, default="")
    keywords: Mapped[list] = mapped_column(JSON, default=list)
    topic_segments: Mapped[list] = mapped_column(JSON, default=list)
    token_count: Mapped[int] = mapped_column(default=0)
    model_used: Mapped[str] = mapped_column(String(100), default="")
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))

    recording: Mapped["Recording"] = relationship(back_populates="hour_summaries")

    def __repr__(self) -> str:
        return f"<HourSummary id={self.id} recording={self.recording_id} hour={self.hour_index}>"


class Template(Base):
    """A user-defined classification template.

    Templates define the structure of Obsidian exports for each category.
    ``triggers`` are keywords used for template matching, ``fields`` define
    the output sections (e.g. summary, key_concepts, action_items).
    """

    __tablename__ = "templates"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    display_name: Mapped[str] = mapped_column(String(255), default="")
    triggers: Mapped[list] = mapped_column(JSON, default=list)
    output_format: Mapped[str] = mapped_column(String(50), default="markdown")
    fields: Mapped[list] = mapped_column(JSON, default=list)
    icon: Mapped[str] = mapped_column(String(10), default="")
    priority: Mapped[int] = mapped_column(default=0)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))

    def __repr__(self) -> str:
        return f"<Template id={self.id} name={self.name!r}>"


class Classification(Base):
    """A zero-shot classification result linking a recording segment to a template."""

    __tablename__ = "classifications"
    __table_args__ = (Index("ix_classifications_recording", "recording_id"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    recording_id: Mapped[int] = mapped_column(ForeignKey("recordings.id"))
    template_id: Mapped[int | None] = mapped_column(ForeignKey("templates.id"), nullable=True)
    template_name: Mapped[str] = mapped_column(String(100), default="")
    start_minute: Mapped[int] = mapped_column(default=0)
    end_minute: Mapped[int] = mapped_column(default=0)
    confidence: Mapped[float] = mapped_column(default=0.0)
    result_json: Mapped[dict] = mapped_column(JSON, default=dict)
    export_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))

    recording: Mapped["Recording"] = relationship(back_populates="classifications")

    def __repr__(self) -> str:
        return (
            f"<Classification id={self.id} recording={self.recording_id}"
            f" template={self.template_name!r}>"
        )


class RAGQuery(Base):
    """A logged RAG search query and its results.

    Persisted for usage analytics and debugging. Records the query text,
    the LLM-generated answer, and the source summaries used.
    """

    __tablename__ = "rag_queries"
    __table_args__ = (Index("ix_rag_queries_created_at", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    query_text: Mapped[str] = mapped_column(Text, default="")
    results_json: Mapped[list] = mapped_column(JSON, default=list)
    model_used: Mapped[str] = mapped_column(String(100), default="")
    answer_text: Mapped[str] = mapped_column(Text, default="")
    sources: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))

    def __repr__(self) -> str:
        return f"<RAGQuery id={self.id}>"
