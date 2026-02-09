"""
SQLAlchemy ORM models for the VoiceVault Week 1 schema.

Tables: ``recordings``, ``transcripts``, ``summaries``.
"""

from datetime import UTC, datetime

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from src.services.storage.database import Base


class Recording(Base):
    """A single recording session."""

    __tablename__ = "recordings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
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
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))

    recording: Mapped["Recording"] = relationship(back_populates="summaries")

    def __repr__(self) -> str:
        return f"<Summary id={self.id} recording={self.recording_id} minute={self.minute_index}>"
