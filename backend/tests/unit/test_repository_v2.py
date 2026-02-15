"""Tests for the v0.2.0 extended RecordingRepository CRUD layer.

Covers: HourSummary, Template, Classification, RAGQuery.
All tests use an in-memory SQLite database provided by the ``repository`` fixture.
"""

import pytest
from sqlalchemy.exc import IntegrityError

from src.core.exceptions import TemplateNotFoundError
from src.services.storage.models_db import (
    Classification,
    HourSummary,
    RAGQuery,
    Recording,
    Template,
)
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


async def _make_template(
    repo: RecordingRepository,
    name: str = "test-template",
    **kwargs: object,
) -> Template:
    """Shortcut to create a template and return it."""
    return await repo.create_template(name=name, **kwargs)


# ===================================================================
# Hour Summaries
# ===================================================================


class TestCreateHourSummary:
    """Verify hour summary creation with default and explicit arguments."""

    async def test_defaults(self, repository: RecordingRepository) -> None:
        """A hour summary created with minimal args has sensible defaults."""
        rec = await _make_recording(repository)
        hs = await repository.create_hour_summary(rec.id, 0, "hour summary")
        assert isinstance(hs, HourSummary)
        assert hs.id is not None
        assert hs.recording_id == rec.id
        assert hs.hour_index == 0
        assert hs.summary_text == "hour summary"
        assert hs.keywords == []
        assert hs.topic_segments == []
        assert hs.token_count == 0
        assert hs.model_used == ""
        assert hs.created_at is not None

    async def test_full_args(self, repository: RecordingRepository) -> None:
        """All optional fields are stored when provided."""
        rec = await _make_recording(repository)
        hs = await repository.create_hour_summary(
            rec.id,
            1,
            "detailed hour summary",
            keywords=["AI", "ML"],
            topic_segments=[{"topic": "intro", "start": 0, "end": 10}],
            token_count=450,
            model_used="claude",
        )
        assert hs.keywords == ["AI", "ML"]
        assert hs.topic_segments == [{"topic": "intro", "start": 0, "end": 10}]
        assert hs.token_count == 450
        assert hs.model_used == "claude"


class TestListHourSummaries:
    """Verify hour summary listing with ordering."""

    async def test_ordered_by_hour_index(self, repository: RecordingRepository) -> None:
        """Hour summaries are returned sorted by hour_index ascending."""
        rec = await _make_recording(repository)
        await repository.create_hour_summary(rec.id, 2, "c")
        await repository.create_hour_summary(rec.id, 0, "a")
        await repository.create_hour_summary(rec.id, 1, "b")
        result = await repository.list_hour_summaries(rec.id)
        assert [hs.hour_index for hs in result] == [0, 1, 2]

    async def test_empty(self, repository: RecordingRepository) -> None:
        """Recording with no hour summaries returns an empty list."""
        rec = await _make_recording(repository)
        result = await repository.list_hour_summaries(rec.id)
        assert result == []


# ===================================================================
# Templates
# ===================================================================


class TestCreateTemplate:
    """Verify template creation with full and default arguments."""

    async def test_full_args(self, repository: RecordingRepository) -> None:
        """All template fields are stored when provided."""
        t = await _make_template(
            repository,
            name="lecture",
            display_name="Lecture Note",
            triggers=["lecture", "class"],
            output_format="markdown",
            fields=[{"name": "topic", "type": "string"}],
            icon="📚",
            priority=10,
        )
        assert isinstance(t, Template)
        assert t.id is not None
        assert t.name == "lecture"
        assert t.display_name == "Lecture Note"
        assert t.triggers == ["lecture", "class"]
        assert t.output_format == "markdown"
        assert t.fields == [{"name": "topic", "type": "string"}]
        assert t.icon == "📚"
        assert t.priority == 10
        assert t.is_default is False
        assert t.is_active is True
        assert t.created_at is not None

    async def test_defaults(self, repository: RecordingRepository) -> None:
        """Optional fields fall back to empty/zero defaults."""
        t = await _make_template(repository, name="minimal")
        assert t.display_name == ""
        assert t.triggers == []
        assert t.output_format == "markdown"
        assert t.fields == []
        assert t.icon == ""
        assert t.priority == 0


class TestGetTemplate:
    """Verify single-template retrieval by ID."""

    async def test_existing(self, repository: RecordingRepository) -> None:
        """Fetching an existing template returns the correct row."""
        created = await _make_template(repository)
        fetched = await repository.get_template(created.id)
        assert fetched.id == created.id
        assert fetched.name == "test-template"

    async def test_not_found_raises(self, repository: RecordingRepository) -> None:
        """Fetching a non-existent template ID raises TemplateNotFoundError."""
        with pytest.raises(TemplateNotFoundError):
            await repository.get_template(9999)


class TestGetTemplateByName:
    """Verify template lookup by unique name."""

    async def test_existing(self, repository: RecordingRepository) -> None:
        """Fetching by name returns the matching template."""
        await _make_template(repository, name="lecture")
        fetched = await repository.get_template_by_name("lecture")
        assert fetched is not None
        assert fetched.name == "lecture"

    async def test_nonexistent_returns_none(self, repository: RecordingRepository) -> None:
        """Non-existent name returns None instead of raising."""
        result = await repository.get_template_by_name("nonexistent")
        assert result is None


class TestListTemplates:
    """Verify template listing with active filtering and priority ordering."""

    async def test_returns_active_only_by_default(self, repository: RecordingRepository) -> None:
        """Inactive templates are excluded from the default listing."""
        await _make_template(repository, name="active-one")
        t2 = await _make_template(repository, name="inactive-one")
        await repository.update_template(t2.id, is_active=False)
        result = await repository.list_templates()
        assert len(result) == 1
        assert result[0].name == "active-one"

    async def test_returns_all(self, repository: RecordingRepository) -> None:
        """Setting active_only=False includes inactive templates."""
        await _make_template(repository, name="a")
        t2 = await _make_template(repository, name="b")
        await repository.update_template(t2.id, is_active=False)
        result = await repository.list_templates(active_only=False)
        assert len(result) == 2

    async def test_ordered_by_priority_desc(self, repository: RecordingRepository) -> None:
        """Templates are sorted by priority descending."""
        await _make_template(repository, name="low", priority=1)
        await _make_template(repository, name="high", priority=10)
        await _make_template(repository, name="mid", priority=5)
        result = await repository.list_templates()
        assert [t.name for t in result] == ["high", "mid", "low"]


class TestUpdateTemplate:
    """Verify in-place template field updates."""

    async def test_field_update(self, repository: RecordingRepository) -> None:
        """Updated fields are persisted and returned."""
        t = await _make_template(repository)
        updated = await repository.update_template(t.id, display_name="Updated Name", priority=99)
        assert updated.display_name == "Updated Name"
        assert updated.priority == 99


class TestDeleteTemplate:
    """Verify template deletion and error handling."""

    async def test_deletes(self, repository: RecordingRepository) -> None:
        """Deleted template is no longer retrievable."""
        t = await _make_template(repository)
        await repository.delete_template(t.id)
        with pytest.raises(TemplateNotFoundError):
            await repository.get_template(t.id)

    async def test_not_found_raises(self, repository: RecordingRepository) -> None:
        """Deleting a non-existent template raises TemplateNotFoundError."""
        with pytest.raises(TemplateNotFoundError):
            await repository.delete_template(9999)


class TestTemplateUniqueName:
    """Verify that template names have a unique constraint."""

    async def test_duplicate_name_raises(self, repository: RecordingRepository) -> None:
        """Creating two templates with the same name raises IntegrityError."""
        await _make_template(repository, name="unique-name")
        with pytest.raises(IntegrityError):
            await _make_template(repository, name="unique-name")


# ===================================================================
# Classifications
# ===================================================================


class TestCreateClassification:
    """Verify classification creation with full and default arguments."""

    async def test_full_args(self, repository: RecordingRepository) -> None:
        """All classification fields are stored when provided."""
        rec = await _make_recording(repository)
        t = await _make_template(repository, name="lecture")
        c = await repository.create_classification(
            recording_id=rec.id,
            template_name="lecture",
            start_minute=0,
            end_minute=45,
            confidence=0.92,
            result_json={"category": "lecture", "topic": "AI"},
            template_id=t.id,
            export_path="/exports/lecture.md",
        )
        assert isinstance(c, Classification)
        assert c.id is not None
        assert c.recording_id == rec.id
        assert c.template_name == "lecture"
        assert c.start_minute == 0
        assert c.end_minute == 45
        assert c.confidence == 0.92
        assert c.result_json == {"category": "lecture", "topic": "AI"}
        assert c.template_id == t.id
        assert c.export_path == "/exports/lecture.md"
        assert c.created_at is not None

    async def test_defaults(self, repository: RecordingRepository) -> None:
        """Optional fields fall back to zero/empty/None defaults."""
        rec = await _make_recording(repository)
        c = await repository.create_classification(
            recording_id=rec.id,
            template_name="generic",
            start_minute=0,
            end_minute=10,
        )
        assert c.confidence == 0.0
        assert c.result_json == {}
        assert c.template_id is None
        assert c.export_path is None

    async def test_nullable_template_id(self, repository: RecordingRepository) -> None:
        """Classification can be created without an associated template."""
        rec = await _make_recording(repository)
        c = await repository.create_classification(
            recording_id=rec.id,
            template_name="unknown",
            start_minute=0,
            end_minute=5,
            template_id=None,
        )
        assert c.template_id is None


class TestListClassifications:
    """Verify classification listing with ordering."""

    async def test_ordered_by_start_minute(self, repository: RecordingRepository) -> None:
        """Classifications are returned sorted by start_minute ascending."""
        rec = await _make_recording(repository)
        await repository.create_classification(rec.id, "b", 10, 20)
        await repository.create_classification(rec.id, "a", 0, 9)
        await repository.create_classification(rec.id, "c", 21, 30)
        result = await repository.list_classifications(rec.id)
        assert [c.start_minute for c in result] == [0, 10, 21]

    async def test_empty(self, repository: RecordingRepository) -> None:
        """Recording with no classifications returns an empty list."""
        rec = await _make_recording(repository)
        result = await repository.list_classifications(rec.id)
        assert result == []


# ===================================================================
# RAG Queries
# ===================================================================


class TestCreateRAGQuery:
    """Verify RAG query log creation with full and default arguments."""

    async def test_full_args(self, repository: RecordingRepository) -> None:
        """All RAG query fields are stored when provided."""
        rq = await repository.create_rag_query(
            query_text="What did the lecture say about RAG?",
            results_json=[{"id": 1, "score": 0.95}],
            model_used="claude",
            answer_text="The lecture discussed RAG architecture...",
            sources=[{"recording_id": 1, "minute_index": 5}],
        )
        assert isinstance(rq, RAGQuery)
        assert rq.id is not None
        assert rq.query_text == "What did the lecture say about RAG?"
        assert rq.results_json == [{"id": 1, "score": 0.95}]
        assert rq.model_used == "claude"
        assert rq.answer_text == "The lecture discussed RAG architecture..."
        assert rq.sources == [{"recording_id": 1, "minute_index": 5}]
        assert rq.created_at is not None

    async def test_defaults(self, repository: RecordingRepository) -> None:
        """Optional fields default to empty lists/strings."""
        rq = await repository.create_rag_query(query_text="test query")
        assert rq.results_json == []
        assert rq.model_used == ""
        assert rq.answer_text == ""
        assert rq.sources == []


class TestListRAGQueries:
    """Verify RAG query listing with ordering and limit."""

    async def test_ordered_by_created_at_desc(self, repository: RecordingRepository) -> None:
        """Queries are returned most-recent-first."""
        await repository.create_rag_query(query_text="first")
        await repository.create_rag_query(query_text="second")
        await repository.create_rag_query(query_text="third")
        result = await repository.list_rag_queries()
        # Most recent first (desc); IDs increase so last created = highest ID
        assert result[0].id >= result[-1].id

    async def test_limit(self, repository: RecordingRepository) -> None:
        """Limit caps the number of returned rows."""
        for i in range(5):
            await repository.create_rag_query(query_text=f"query-{i}")
        result = await repository.list_rag_queries(limit=3)
        assert len(result) == 3

    async def test_empty(self, repository: RecordingRepository) -> None:
        """Empty table returns an empty list."""
        result = await repository.list_rag_queries()
        assert result == []
