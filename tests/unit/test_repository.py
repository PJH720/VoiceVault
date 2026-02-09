"""Tests for the RecordingRepository CRUD layer."""

import pytest

from src.core.exceptions import RecordingNotFoundError
from src.services.storage.models_db import Recording, Summary, Transcript
from src.services.storage.repository import RecordingRepository

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _make_recording(
    repo: RecordingRepository,
    title: str | None = None,
) -> Recording:
    """Shortcut to create a recording and return it."""
    return await repo.create_recording(title=title)


# ===================================================================
# Recordings
# ===================================================================


class TestCreateRecording:
    async def test_defaults(self, repository: RecordingRepository) -> None:
        rec = await repository.create_recording()
        assert rec.id is not None
        assert rec.title is None
        assert rec.status == "active"
        assert rec.total_minutes == 0
        assert rec.started_at is not None

    async def test_with_title(self, repository: RecordingRepository) -> None:
        rec = await repository.create_recording(title="Lecture 1")
        assert rec.title == "Lecture 1"

    async def test_with_audio_path(self, repository: RecordingRepository) -> None:
        rec = await repository.create_recording(audio_path="/tmp/a.wav")
        assert rec.audio_path == "/tmp/a.wav"


class TestGetRecording:
    async def test_existing(self, repository: RecordingRepository) -> None:
        created = await _make_recording(repository)
        fetched = await repository.get_recording(created.id)
        assert fetched.id == created.id

    async def test_not_found_raises(self, repository: RecordingRepository) -> None:
        with pytest.raises(RecordingNotFoundError):
            await repository.get_recording(9999)

    async def test_loads_relationships(self, repository: RecordingRepository) -> None:
        rec = await _make_recording(repository)
        await repository.create_transcript(rec.id, 0, "hello")
        await repository.create_summary(rec.id, 0, "summary")
        fetched = await repository.get_recording(rec.id)
        assert isinstance(fetched.transcripts, list)
        assert isinstance(fetched.summaries, list)


class TestListRecordings:
    async def test_empty(self, repository: RecordingRepository) -> None:
        result = await repository.list_recordings()
        assert result == []

    async def test_returns_all(self, repository: RecordingRepository) -> None:
        await _make_recording(repository, "A")
        await _make_recording(repository, "B")
        result = await repository.list_recordings()
        assert len(result) == 2

    async def test_filter_by_status(self, repository: RecordingRepository) -> None:
        rec = await _make_recording(repository)
        await repository.stop_recording(rec.id)
        await _make_recording(repository)  # still active

        active = await repository.list_recordings(status="active")
        completed = await repository.list_recordings(status="completed")
        assert len(active) == 1
        assert len(completed) == 1

    async def test_limit(self, repository: RecordingRepository) -> None:
        for _ in range(5):
            await _make_recording(repository)
        result = await repository.list_recordings(limit=3)
        assert len(result) == 3

    async def test_offset(self, repository: RecordingRepository) -> None:
        for _ in range(5):
            await _make_recording(repository)
        result = await repository.list_recordings(offset=3)
        assert len(result) == 2


class TestStopRecording:
    async def test_sets_completed(self, repository: RecordingRepository) -> None:
        rec = await _make_recording(repository)
        stopped = await repository.stop_recording(rec.id)
        assert stopped.status == "completed"
        assert stopped.ended_at is not None

    async def test_not_found_raises(self, repository: RecordingRepository) -> None:
        with pytest.raises(RecordingNotFoundError):
            await repository.stop_recording(9999)


class TestDeleteRecording:
    async def test_deletes(self, repository: RecordingRepository) -> None:
        rec = await _make_recording(repository)
        await repository.delete_recording(rec.id)
        with pytest.raises(RecordingNotFoundError):
            await repository.get_recording(rec.id)

    async def test_cascades_transcripts(self, repository: RecordingRepository) -> None:
        rec = await _make_recording(repository)
        await repository.create_transcript(rec.id, 0, "hello")
        await repository.delete_recording(rec.id)
        remaining = await repository.list_transcripts(rec.id)
        assert remaining == []

    async def test_cascades_summaries(self, repository: RecordingRepository) -> None:
        rec = await _make_recording(repository)
        await repository.create_summary(rec.id, 0, "sum")
        await repository.delete_recording(rec.id)
        remaining = await repository.list_summaries(rec.id)
        assert remaining == []

    async def test_not_found_raises(self, repository: RecordingRepository) -> None:
        with pytest.raises(RecordingNotFoundError):
            await repository.delete_recording(9999)


# ===================================================================
# Transcripts
# ===================================================================


class TestCreateTranscript:
    async def test_full_args(self, repository: RecordingRepository) -> None:
        rec = await _make_recording(repository)
        t = await repository.create_transcript(
            rec.id, 0, "hello world", confidence=0.95, language="en"
        )
        assert isinstance(t, Transcript)
        assert t.text == "hello world"
        assert t.confidence == 0.95
        assert t.language == "en"

    async def test_defaults(self, repository: RecordingRepository) -> None:
        rec = await _make_recording(repository)
        t = await repository.create_transcript(rec.id, 0, "text")
        assert t.confidence == 0.0
        assert t.language == "unknown"


class TestListTranscripts:
    async def test_ordered_by_minute_index(self, repository: RecordingRepository) -> None:
        rec = await _make_recording(repository)
        await repository.create_transcript(rec.id, 2, "c")
        await repository.create_transcript(rec.id, 0, "a")
        await repository.create_transcript(rec.id, 1, "b")
        result = await repository.list_transcripts(rec.id)
        assert [t.minute_index for t in result] == [0, 1, 2]

    async def test_empty(self, repository: RecordingRepository) -> None:
        rec = await _make_recording(repository)
        result = await repository.list_transcripts(rec.id)
        assert result == []


# ===================================================================
# Summaries
# ===================================================================


class TestCreateSummary:
    async def test_full_args(self, repository: RecordingRepository) -> None:
        rec = await _make_recording(repository)
        s = await repository.create_summary(
            rec.id,
            0,
            "summary text",
            keywords=["AI", "ML"],
            speakers=["Alice"],
            confidence=0.88,
            model_used="claude",
        )
        assert isinstance(s, Summary)
        assert s.summary_text == "summary text"
        assert s.keywords == ["AI", "ML"]
        assert s.speakers == ["Alice"]
        assert s.confidence == 0.88
        assert s.model_used == "claude"

    async def test_defaults(self, repository: RecordingRepository) -> None:
        rec = await _make_recording(repository)
        s = await repository.create_summary(rec.id, 0, "text")
        assert s.keywords == []
        assert s.speakers == []
        assert s.confidence == 0.0
        assert s.model_used == ""


class TestListSummaries:
    async def test_ordered_by_minute_index(self, repository: RecordingRepository) -> None:
        rec = await _make_recording(repository)
        await repository.create_summary(rec.id, 2, "c")
        await repository.create_summary(rec.id, 0, "a")
        await repository.create_summary(rec.id, 1, "b")
        result = await repository.list_summaries(rec.id)
        assert [s.minute_index for s in result] == [0, 1, 2]


class TestListSummariesInRange:
    async def test_inclusive_range(self, repository: RecordingRepository) -> None:
        rec = await _make_recording(repository)
        for i in range(5):
            await repository.create_summary(rec.id, i, f"sum-{i}")
        result = await repository.list_summaries_in_range(rec.id, 1, 3)
        assert [s.minute_index for s in result] == [1, 2, 3]

    async def test_empty_range(self, repository: RecordingRepository) -> None:
        rec = await _make_recording(repository)
        await repository.create_summary(rec.id, 0, "sum")
        result = await repository.list_summaries_in_range(rec.id, 5, 10)
        assert result == []

    async def test_single_minute(self, repository: RecordingRepository) -> None:
        rec = await _make_recording(repository)
        await repository.create_summary(rec.id, 3, "sum")
        result = await repository.list_summaries_in_range(rec.id, 3, 3)
        assert len(result) == 1
        assert result[0].minute_index == 3


class TestGetSummary:
    async def test_existing(self, repository: RecordingRepository) -> None:
        rec = await _make_recording(repository)
        s = await repository.create_summary(rec.id, 0, "sum")
        fetched = await repository.get_summary(s.id)
        assert fetched is not None
        assert fetched.id == s.id

    async def test_nonexistent_returns_none(self, repository: RecordingRepository) -> None:
        result = await repository.get_summary(9999)
        assert result is None
