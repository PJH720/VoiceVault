"""Unit tests for Obsidian-compatible Markdown export."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import yaml

from src.core.exceptions import ExportError
from src.core.models import ObsidianExportRequest, RAGSource
from src.services.storage.export import (
    _build_body,
    _build_frontmatter,
    _build_transcript_section,
    _build_wikilinks,
    _get_display_name,
    _get_icon,
    _sanitize_filename,
    export_recording_to_markdown,
)

# ---------------------------------------------------------------------------
# Helpers — lightweight stand-ins for ORM objects
# ---------------------------------------------------------------------------


def _make_recording(
    id: int = 1,
    title: str = "Test Recording",
    started_at: datetime | None = None,
    total_minutes: int = 30,
):
    rec = MagicMock()
    rec.id = id
    rec.title = title
    rec.started_at = started_at or datetime(2026, 2, 10, 10, 30, 0, tzinfo=UTC)
    rec.ended_at = None
    rec.total_minutes = total_minutes
    rec.status = "completed"
    return rec


def _make_summary(
    minute_index: int = 0,
    summary_text: str = "Summary text",
    keywords: list | None = None,
    speakers: list | None = None,
):
    s = MagicMock()
    s.minute_index = minute_index
    s.summary_text = summary_text
    s.keywords = keywords or ["AI"]
    s.speakers = speakers or ["Alice"]
    return s


def _make_classification(
    template_name: str = "lecture",
    confidence: float = 0.9,
    result_json: dict | None = None,
):
    c = MagicMock()
    c.id = 1
    c.recording_id = 1
    c.template_name = template_name
    c.confidence = confidence
    c.result_json = result_json or {}
    c.export_path = None
    return c


def _make_template(
    name: str = "lecture",
    display_name: str = "\uac15\uc758 \ub178\ud2b8",
    icon: str = "\U0001f4da",
    fields: list | None = None,
):
    t = MagicMock()
    t.name = name
    t.display_name = display_name
    t.icon = icon
    t.fields = fields or [
        {"name": "summary", "label": "\uc694\uc57d", "type": "text"},
        {"name": "key_concepts", "label": "\ud575\uc2ec \uac1c\ub150", "type": "list"},
        {"name": "examples", "label": "\uc608\uc2dc", "type": "list"},
        {"name": "questions", "label": "\uc9c8\ubb38", "type": "list"},
    ]
    return t


def _make_transcript(minute_index: int = 0, text: str = "Hello world"):
    t = MagicMock()
    t.minute_index = minute_index
    t.text = text
    return t


def _make_hour_summary(hour_index: int = 0, summary_text: str = "Hour summary"):
    hs = MagicMock()
    hs.hour_index = hour_index
    hs.summary_text = summary_text
    return hs


# ---------------------------------------------------------------------------
# _build_frontmatter tests
# ---------------------------------------------------------------------------


def test_build_frontmatter_complete():
    """All fields present produces valid YAML with title, date, type, tags."""
    recording = _make_recording(title="Advanced AI")
    classification = _make_classification(template_name="lecture", confidence=0.92)
    template = _make_template()
    summaries = [
        _make_summary(keywords=["AI", "transformer"], speakers=["Prof Kim"]),
        _make_summary(minute_index=1, keywords=["AI", "attention"], speakers=["Prof Kim"]),
    ]

    result = _build_frontmatter(recording, classification, template, summaries)

    assert result.startswith("---")
    assert result.endswith("---")

    # Parse YAML content between delimiters
    yaml_body = result.strip().removeprefix("---").removesuffix("---").strip()
    data = yaml.safe_load(yaml_body)

    assert "\U0001f4da" in data["title"]
    assert "Advanced AI" in data["title"]
    assert data["type"] == "lecture"
    assert data["category"] == "lecture"
    assert data["recording_id"] == 1
    assert data["confidence"] == 0.92
    assert "AI" in data["tags"]
    assert "transformer" in data["keywords"]
    assert "Prof Kim" in data["speakers"]
    assert data["duration"] == "00:30:00"


def test_build_frontmatter_no_classification():
    """No classification falls back to memo defaults."""
    recording = _make_recording()
    summaries = [_make_summary()]

    result = _build_frontmatter(recording, None, None, summaries)

    yaml_body = result.strip().removeprefix("---").removesuffix("---").strip()
    data = yaml.safe_load(yaml_body)

    assert data["type"] == "memo"
    assert data["category"] == "memo"
    assert data["confidence"] == 0.0


# ---------------------------------------------------------------------------
# _build_body tests
# ---------------------------------------------------------------------------


def test_build_body_lecture_template():
    """Lecture template renders key_concepts, examples, questions sections."""
    recording = _make_recording()
    classification = _make_classification(
        result_json={
            "summary": "AI lecture overview",
            "key_concepts": ["Transformer", "Attention"],
            "examples": ["BERT", "GPT"],
            "questions": ["How does attention work?"],
        }
    )
    template = _make_template()
    summaries = [_make_summary()]

    result = _build_body(recording, classification, template, summaries, [])

    assert "AI lecture overview" in result
    assert "Transformer" in result
    assert "BERT" in result
    assert "How does attention work?" in result


def test_build_body_fallback_summaries():
    """No structured result_json uses raw summaries."""
    recording = _make_recording()
    summaries = [
        _make_summary(summary_text="First minute summary"),
        _make_summary(minute_index=1, summary_text="Second minute summary"),
    ]

    result = _build_body(recording, None, None, summaries, [])

    assert "First minute summary" in result
    assert "Second minute summary" in result


# ---------------------------------------------------------------------------
# _build_wikilinks tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_build_wikilinks_with_similar():
    """RAG returns similar recordings, generates [[wikilinks]]."""
    retriever = AsyncMock()
    retriever.find_similar.return_value = [
        RAGSource(
            recording_id=2,
            minute_index=0,
            summary_text="Related topic",
            similarity=0.85,
            date="2026-02-09",
            category="lecture",
        ),
        RAGSource(
            recording_id=3,
            minute_index=0,
            summary_text="Another related",
            similarity=0.72,
            date="2026-02-08",
            category="memo",
        ),
    ]

    result = await _build_wikilinks(recording_id=1, retriever=retriever)

    assert "Related Notes" in result
    assert "[[Recording 2 - 2026-02-09]]" in result
    assert "[[Recording 3 - 2026-02-08]]" in result
    retriever.find_similar.assert_called_once_with(recording_id=1, top_k=3)


@pytest.mark.asyncio
async def test_build_wikilinks_no_results():
    """RAG returns empty, section omitted."""
    retriever = AsyncMock()
    retriever.find_similar.return_value = []

    result = await _build_wikilinks(recording_id=1, retriever=retriever)

    assert result == ""


@pytest.mark.asyncio
async def test_build_wikilinks_retriever_error():
    """RAG failure is handled gracefully, returns empty string."""
    retriever = AsyncMock()
    retriever.find_similar.side_effect = RuntimeError("Connection refused")

    result = await _build_wikilinks(recording_id=1, retriever=retriever)

    assert result == ""


# ---------------------------------------------------------------------------
# _build_transcript_section tests
# ---------------------------------------------------------------------------


def test_build_transcript_section():
    """Collapsible section with timestamped lines."""
    transcripts = [
        _make_transcript(minute_index=0, text="Hello world"),
        _make_transcript(minute_index=5, text="Five minutes in"),
    ]

    result = _build_transcript_section(transcripts)

    assert "<details>" in result
    assert "<summary>" in result
    assert "[00:00] Hello world" in result
    assert "[05:00] Five minutes in" in result
    assert "</details>" in result


def test_build_transcript_section_empty():
    """Empty transcripts returns empty string."""
    result = _build_transcript_section([])
    assert result == ""


# ---------------------------------------------------------------------------
# _sanitize_filename tests
# ---------------------------------------------------------------------------


def test_sanitize_filename_removes_special_chars():
    """Special characters removed from filename."""
    assert _sanitize_filename('file<>:"/\\|?*.md') == "file.md"


def test_sanitize_filename_empty():
    """Empty after sanitization returns 'untitled'."""
    assert _sanitize_filename(':::""') == "untitled"


# ---------------------------------------------------------------------------
# export_recording_to_markdown tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_export_writes_file(tmp_path):
    """Full export writes to exports_dir and returns valid response."""
    recording = _make_recording(title="Test Export")
    summaries = [_make_summary()]
    transcripts = [_make_transcript()]
    hour_summaries = []
    classifications = []

    mock_repo = AsyncMock()
    mock_repo.get_recording.return_value = recording
    mock_repo.list_summaries.return_value = summaries
    mock_repo.list_transcripts.return_value = transcripts
    mock_repo.list_hour_summaries.return_value = hour_summaries
    mock_repo.list_classifications.return_value = classifications
    mock_repo.get_template_by_name.return_value = None

    mock_session = AsyncMock()

    mock_settings = MagicMock()
    mock_settings.exports_dir = str(tmp_path / "exports")
    mock_settings.obsidian_vault_path = ""
    mock_settings.obsidian_export_folder = "VoiceVault"
    mock_settings.obsidian_frontmatter = True
    mock_settings.obsidian_wikilinks = False

    with (
        patch(
            "src.services.storage.export.RecordingRepository",
            return_value=mock_repo,
        ),
        patch("src.services.storage.export.get_settings", return_value=mock_settings),
    ):
        result = await export_recording_to_markdown(
            recording_id=1,
            request=ObsidianExportRequest(),
            session=mock_session,
        )

    assert result.file_path.endswith(".md")
    assert "---" in result.markdown_content
    assert result.frontmatter.get("recording_id") == 1

    # Verify file was written
    from pathlib import Path

    assert Path(result.file_path).exists()


@pytest.mark.asyncio
async def test_export_to_vault_path(tmp_path):
    """When vault_path set, file also copied there."""
    recording = _make_recording(title="Vault Export")
    vault_dir = tmp_path / "vault"

    mock_repo = AsyncMock()
    mock_repo.get_recording.return_value = recording
    mock_repo.list_summaries.return_value = [_make_summary()]
    mock_repo.list_transcripts.return_value = []
    mock_repo.list_hour_summaries.return_value = []
    mock_repo.list_classifications.return_value = []
    mock_repo.get_template_by_name.return_value = None

    mock_session = AsyncMock()

    mock_settings = MagicMock()
    mock_settings.exports_dir = str(tmp_path / "exports")
    mock_settings.obsidian_vault_path = ""
    mock_settings.obsidian_export_folder = "VoiceVault"
    mock_settings.obsidian_frontmatter = True
    mock_settings.obsidian_wikilinks = False

    request = ObsidianExportRequest(vault_path=str(vault_dir))

    with (
        patch(
            "src.services.storage.export.RecordingRepository",
            return_value=mock_repo,
        ),
        patch("src.services.storage.export.get_settings", return_value=mock_settings),
    ):
        result = await export_recording_to_markdown(
            recording_id=1,
            request=request,
            session=mock_session,
        )

    from pathlib import Path

    # Original export exists
    assert Path(result.file_path).exists()
    # Vault copy exists
    vault_exports = vault_dir / "VoiceVault"
    assert vault_exports.exists()
    vault_files = list(vault_exports.glob("*.md"))
    assert len(vault_files) == 1


@pytest.mark.asyncio
async def test_export_with_classification_and_template(tmp_path):
    """Export with classification picks template and renders structured body."""
    recording = _make_recording(title="AI Lecture")
    classification = _make_classification(
        template_name="lecture",
        confidence=0.95,
        result_json={
            "summary": "Deep learning overview",
            "key_concepts": ["CNN", "RNN"],
        },
    )
    template = _make_template()

    mock_repo = AsyncMock()
    mock_repo.get_recording.return_value = recording
    mock_repo.list_summaries.return_value = [_make_summary()]
    mock_repo.list_transcripts.return_value = []
    mock_repo.list_hour_summaries.return_value = []
    mock_repo.list_classifications.return_value = [classification]
    mock_repo.get_template_by_name.return_value = template

    mock_session = AsyncMock()

    mock_settings = MagicMock()
    mock_settings.exports_dir = str(tmp_path / "exports")
    mock_settings.obsidian_vault_path = ""
    mock_settings.obsidian_export_folder = "VoiceVault"
    mock_settings.obsidian_frontmatter = True
    mock_settings.obsidian_wikilinks = False

    with (
        patch(
            "src.services.storage.export.RecordingRepository",
            return_value=mock_repo,
        ),
        patch("src.services.storage.export.get_settings", return_value=mock_settings),
    ):
        result = await export_recording_to_markdown(
            recording_id=1,
            request=ObsidianExportRequest(),
            session=mock_session,
        )

    assert "Deep learning overview" in result.markdown_content
    assert "CNN" in result.markdown_content
    assert result.frontmatter.get("type") == "lecture"
    assert result.frontmatter.get("confidence") == 0.95


# ---------------------------------------------------------------------------
# _get_icon / _get_display_name fallback tests
# ---------------------------------------------------------------------------


def test_get_icon_fallback_to_classification():
    """No template → falls back to _DEFAULT_ICONS via classification.template_name."""
    lecture_cls = _make_classification(template_name="lecture")
    assert _get_icon(None, lecture_cls) == "\U0001f4da"

    unknown_cls = _make_classification(template_name="unknown_type")
    assert _get_icon(None, unknown_cls) == "\U0001f4a1"

    assert _get_icon(None, None) == "\U0001f4a1"


def test_get_display_name_fallback_to_classification():
    """No template → humanised template_name from classification."""
    meeting_cls = _make_classification(template_name="meeting")
    assert _get_display_name(None, meeting_cls) == "Meeting"

    personal_cls = _make_classification(template_name="personal_memo")
    assert _get_display_name(None, personal_cls) == "Personal Memo"


# ---------------------------------------------------------------------------
# _build_body edge case tests
# ---------------------------------------------------------------------------


def test_build_body_with_hour_summaries():
    """Hour summaries generate a 시간별 요약 section."""
    recording = _make_recording()
    summaries = [_make_summary()]
    hour_summaries = [
        _make_hour_summary(hour_index=0, summary_text="Hour 0 text"),
        _make_hour_summary(hour_index=1, summary_text="Hour 1 text"),
    ]

    result = _build_body(recording, None, None, summaries, hour_summaries)

    assert "Hour 0" in result
    assert "Hour 1" in result
    assert "\uc2dc\uac04\ubcc4 \uc694\uc57d" in result
    assert "Hour 0 text" in result
    assert "Hour 1 text" in result


def test_build_body_empty_summaries():
    """No summaries and no template → empty body."""
    recording = _make_recording()
    result = _build_body(recording, None, None, [], [])
    assert result == ""


def test_build_body_field_value_none_skipped():
    """Template fields with None values are skipped in body."""
    recording = _make_recording()
    classification = _make_classification(
        result_json={"summary": "Important text", "key_concepts": None}
    )
    template = _make_template()

    result = _build_body(recording, classification, template, [_make_summary()], [])

    assert "Important text" in result
    assert "\ud575\uc2ec \uac1c\ub150" not in result


# ---------------------------------------------------------------------------
# _build_frontmatter edge case tests
# ---------------------------------------------------------------------------


def test_build_frontmatter_no_duration():
    """total_minutes=0 → no 'duration' key in frontmatter."""
    recording = _make_recording(total_minutes=0)
    summaries = [_make_summary()]

    result = _build_frontmatter(recording, None, None, summaries)

    yaml_body = result.strip().removeprefix("---").removesuffix("---").strip()
    data = yaml.safe_load(yaml_body)
    assert "duration" not in data


def test_build_frontmatter_empty_keywords_speakers():
    """Empty strings and None values in keywords/speakers are filtered out."""
    summaries = [
        _make_summary(keywords=["AI", "", None, "AI"], speakers=["", None]),
    ]
    recording = _make_recording()

    result = _build_frontmatter(recording, None, None, summaries)

    yaml_body = result.strip().removeprefix("---").removesuffix("---").strip()
    data = yaml.safe_load(yaml_body)
    assert data["tags"] == ["AI"]
    assert data["keywords"] == ["AI"]
    assert data["speakers"] == []


# ---------------------------------------------------------------------------
# Error handling tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_export_db_load_failure(tmp_path):
    """Repository exception during data load raises ExportError."""
    mock_repo = AsyncMock()
    mock_repo.get_recording.side_effect = RuntimeError("DB error")

    mock_session = AsyncMock()
    mock_settings = MagicMock()
    mock_settings.exports_dir = str(tmp_path / "exports")
    mock_settings.obsidian_frontmatter = True
    mock_settings.obsidian_wikilinks = False

    with (
        patch(
            "src.services.storage.export.RecordingRepository",
            return_value=mock_repo,
        ),
        patch("src.services.storage.export.get_settings", return_value=mock_settings),
        pytest.raises(ExportError),
    ):
        await export_recording_to_markdown(
            recording_id=1,
            request=ObsidianExportRequest(),
            session=mock_session,
        )


@pytest.mark.asyncio
async def test_export_file_write_failure(tmp_path):
    """File write OSError raises ExportError."""
    recording = _make_recording()
    mock_repo = AsyncMock()
    mock_repo.get_recording.return_value = recording
    mock_repo.list_summaries.return_value = [_make_summary()]
    mock_repo.list_transcripts.return_value = []
    mock_repo.list_hour_summaries.return_value = []
    mock_repo.list_classifications.return_value = []
    mock_repo.get_template_by_name.return_value = None

    mock_session = AsyncMock()
    mock_settings = MagicMock()
    mock_settings.exports_dir = str(tmp_path / "exports")
    mock_settings.obsidian_vault_path = ""
    mock_settings.obsidian_export_folder = "VoiceVault"
    mock_settings.obsidian_frontmatter = True
    mock_settings.obsidian_wikilinks = False

    with (
        patch(
            "src.services.storage.export.RecordingRepository",
            return_value=mock_repo,
        ),
        patch("src.services.storage.export.get_settings", return_value=mock_settings),
        patch("pathlib.Path.write_text", side_effect=OSError("disk full")),
        pytest.raises(ExportError),
    ):
        await export_recording_to_markdown(
            recording_id=1,
            request=ObsidianExportRequest(),
            session=mock_session,
        )


@pytest.mark.asyncio
async def test_export_vault_copy_failure(tmp_path):
    """Vault copy failure logs warning but still returns result."""
    recording = _make_recording()
    mock_repo = AsyncMock()
    mock_repo.get_recording.return_value = recording
    mock_repo.list_summaries.return_value = [_make_summary()]
    mock_repo.list_transcripts.return_value = []
    mock_repo.list_hour_summaries.return_value = []
    mock_repo.list_classifications.return_value = []
    mock_repo.get_template_by_name.return_value = None

    mock_session = AsyncMock()
    mock_settings = MagicMock()
    mock_settings.exports_dir = str(tmp_path / "exports")
    mock_settings.obsidian_vault_path = ""
    mock_settings.obsidian_export_folder = "VoiceVault"
    mock_settings.obsidian_frontmatter = True
    mock_settings.obsidian_wikilinks = False

    vault_dir = tmp_path / "vault"
    request = ObsidianExportRequest(vault_path=str(vault_dir))

    with (
        patch(
            "src.services.storage.export.RecordingRepository",
            return_value=mock_repo,
        ),
        patch("src.services.storage.export.get_settings", return_value=mock_settings),
        patch(
            "src.services.storage.export.shutil.copy2",
            side_effect=OSError("permission denied"),
        ),
    ):
        result = await export_recording_to_markdown(
            recording_id=1,
            request=request,
            session=mock_session,
        )

    assert result.file_path.endswith(".md")
    assert result.markdown_content


@pytest.mark.asyncio
async def test_export_yaml_parse_failure(tmp_path):
    """YAML parse error during frontmatter extraction → empty frontmatter dict."""
    recording = _make_recording()
    mock_repo = AsyncMock()
    mock_repo.get_recording.return_value = recording
    mock_repo.list_summaries.return_value = [_make_summary()]
    mock_repo.list_transcripts.return_value = []
    mock_repo.list_hour_summaries.return_value = []
    mock_repo.list_classifications.return_value = []
    mock_repo.get_template_by_name.return_value = None

    mock_session = AsyncMock()
    mock_settings = MagicMock()
    mock_settings.exports_dir = str(tmp_path / "exports")
    mock_settings.obsidian_vault_path = ""
    mock_settings.obsidian_export_folder = "VoiceVault"
    mock_settings.obsidian_frontmatter = True
    mock_settings.obsidian_wikilinks = False

    with (
        patch(
            "src.services.storage.export.RecordingRepository",
            return_value=mock_repo,
        ),
        patch("src.services.storage.export.get_settings", return_value=mock_settings),
        patch(
            "src.services.storage.export.yaml.safe_load",
            side_effect=yaml.YAMLError("bad yaml"),
        ),
    ):
        result = await export_recording_to_markdown(
            recording_id=1,
            request=ObsidianExportRequest(),
            session=mock_session,
        )

    assert result.frontmatter == {}


# ---------------------------------------------------------------------------
# Integration path tests (wikilinks, transcript, frontmatter disabled)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_export_with_wikilinks_enabled(tmp_path):
    """obsidian_wikilinks=True + retriever produces Related Notes section."""
    recording = _make_recording()
    mock_repo = AsyncMock()
    mock_repo.get_recording.return_value = recording
    mock_repo.list_summaries.return_value = [_make_summary()]
    mock_repo.list_transcripts.return_value = []
    mock_repo.list_hour_summaries.return_value = []
    mock_repo.list_classifications.return_value = []
    mock_repo.get_template_by_name.return_value = None

    mock_session = AsyncMock()
    mock_settings = MagicMock()
    mock_settings.exports_dir = str(tmp_path / "exports")
    mock_settings.obsidian_vault_path = ""
    mock_settings.obsidian_export_folder = "VoiceVault"
    mock_settings.obsidian_frontmatter = True
    mock_settings.obsidian_wikilinks = True

    retriever = AsyncMock()
    retriever.find_similar.return_value = [
        RAGSource(
            recording_id=5,
            minute_index=0,
            summary_text="Related topic",
            similarity=0.8,
            date="2026-02-09",
            category="lecture",
        ),
    ]

    with (
        patch(
            "src.services.storage.export.RecordingRepository",
            return_value=mock_repo,
        ),
        patch("src.services.storage.export.get_settings", return_value=mock_settings),
    ):
        result = await export_recording_to_markdown(
            recording_id=1,
            request=ObsidianExportRequest(),
            session=mock_session,
            retriever=retriever,
        )

    assert "Related Notes" in result.markdown_content
    assert "[[Recording 5 - 2026-02-09]]" in result.markdown_content


@pytest.mark.asyncio
async def test_export_with_transcript_included(tmp_path):
    """include_transcript=True appends collapsible transcript section."""
    recording = _make_recording()
    transcripts = [
        _make_transcript(minute_index=0, text="Hello world"),
        _make_transcript(minute_index=3, text="Three minutes in"),
    ]

    mock_repo = AsyncMock()
    mock_repo.get_recording.return_value = recording
    mock_repo.list_summaries.return_value = [_make_summary()]
    mock_repo.list_transcripts.return_value = transcripts
    mock_repo.list_hour_summaries.return_value = []
    mock_repo.list_classifications.return_value = []
    mock_repo.get_template_by_name.return_value = None

    mock_session = AsyncMock()
    mock_settings = MagicMock()
    mock_settings.exports_dir = str(tmp_path / "exports")
    mock_settings.obsidian_vault_path = ""
    mock_settings.obsidian_export_folder = "VoiceVault"
    mock_settings.obsidian_frontmatter = True
    mock_settings.obsidian_wikilinks = False

    with (
        patch(
            "src.services.storage.export.RecordingRepository",
            return_value=mock_repo,
        ),
        patch("src.services.storage.export.get_settings", return_value=mock_settings),
    ):
        result = await export_recording_to_markdown(
            recording_id=1,
            request=ObsidianExportRequest(include_transcript=True),
            session=mock_session,
        )

    assert "<details>" in result.markdown_content
    assert "[00:00] Hello world" in result.markdown_content
    assert "[03:00] Three minutes in" in result.markdown_content


@pytest.mark.asyncio
async def test_export_request_none_uses_default(tmp_path):
    """request=None uses default ObsidianExportRequest (no transcript)."""
    recording = _make_recording()
    mock_repo = AsyncMock()
    mock_repo.get_recording.return_value = recording
    mock_repo.list_summaries.return_value = [_make_summary()]
    mock_repo.list_transcripts.return_value = [_make_transcript()]
    mock_repo.list_hour_summaries.return_value = []
    mock_repo.list_classifications.return_value = []
    mock_repo.get_template_by_name.return_value = None

    mock_session = AsyncMock()
    mock_settings = MagicMock()
    mock_settings.exports_dir = str(tmp_path / "exports")
    mock_settings.obsidian_vault_path = ""
    mock_settings.obsidian_export_folder = "VoiceVault"
    mock_settings.obsidian_frontmatter = True
    mock_settings.obsidian_wikilinks = False

    with (
        patch(
            "src.services.storage.export.RecordingRepository",
            return_value=mock_repo,
        ),
        patch("src.services.storage.export.get_settings", return_value=mock_settings),
    ):
        result = await export_recording_to_markdown(
            recording_id=1,
            request=None,
            session=mock_session,
        )

    assert result.file_path.endswith(".md")
    # Default request has include_transcript=False, so no <details> section
    assert "<details>" not in result.markdown_content


@pytest.mark.asyncio
async def test_export_frontmatter_disabled(tmp_path):
    """obsidian_frontmatter=False → no YAML frontmatter, empty fm dict."""
    recording = _make_recording()
    mock_repo = AsyncMock()
    mock_repo.get_recording.return_value = recording
    mock_repo.list_summaries.return_value = [_make_summary()]
    mock_repo.list_transcripts.return_value = []
    mock_repo.list_hour_summaries.return_value = []
    mock_repo.list_classifications.return_value = []
    mock_repo.get_template_by_name.return_value = None

    mock_session = AsyncMock()
    mock_settings = MagicMock()
    mock_settings.exports_dir = str(tmp_path / "exports")
    mock_settings.obsidian_vault_path = ""
    mock_settings.obsidian_export_folder = "VoiceVault"
    mock_settings.obsidian_frontmatter = False
    mock_settings.obsidian_wikilinks = False

    with (
        patch(
            "src.services.storage.export.RecordingRepository",
            return_value=mock_repo,
        ),
        patch("src.services.storage.export.get_settings", return_value=mock_settings),
    ):
        result = await export_recording_to_markdown(
            recording_id=1,
            request=ObsidianExportRequest(),
            session=mock_session,
        )

    assert "---" not in result.markdown_content
    assert result.frontmatter == {}


# Additional edge cases for #63

def test_sanitize_filename_dots_only():
    """Dots-only name should fallback to 'untitled'."""
    assert _sanitize_filename("...") == "untitled"


def test_sanitize_filename_spaces_only():
    """Spaces-only name should fallback to 'untitled'."""
    assert _sanitize_filename("   ") == "untitled"


def test_sanitize_filename_unicode():
    """Unicode characters should be preserved."""
    assert _sanitize_filename("강의 노트 2026.md") == "강의 노트 2026.md"


def test_get_icon_no_template_no_classification():
    """Without both template and classification, fallback icon is used."""
    assert _get_icon(None, None) == "\U0001f4a1"


def test_get_display_name_no_template_no_classification():
    """Without both, fallback display name is 'Memo'."""
    assert _get_display_name(None, None) == "Memo"


def test_build_body_list_field_with_empty_items():
    """List fields with empty items should skip them."""
    from unittest.mock import MagicMock

    rec = MagicMock()
    classification = MagicMock()
    classification.result_json = {"key_concepts": ["concept1", "", "concept3", None]}
    template = MagicMock()
    template.fields = [{"name": "key_concepts", "label": "Key Concepts", "type": "list"}]

    body = _build_body(rec, classification, template, [], [])
    assert "concept1" in body
    assert "concept3" in body
    # Empty items filtered out by the `if item` guard
    lines = [l for l in body.split("\n") if l.startswith("- ")]
    assert len(lines) == 2


def test_build_transcript_section_timestamps_formatted():
    """Transcript timestamps should be zero-padded."""
    from unittest.mock import MagicMock

    t1 = MagicMock()
    t1.minute_index = 5
    t1.text = "Hello world"
    t2 = MagicMock()
    t2.minute_index = 75
    t2.text = "Another transcript"

    result = _build_transcript_section([t1, t2])
    assert "[05:00]" in result
    assert "[75:00]" in result
    assert "<details>" in result
