"""Unit tests for VaultAdapter and standardized frontmatter."""

from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

from src.services.storage.export import (
    VaultAdapter,
    build_standardized_frontmatter,
)

# ---------------------------------------------------------------------------
# Helpers
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
    keywords: list[str] | None = None,
    speakers: list[str] | None = None,
):
    s = MagicMock()
    s.keywords = keywords or ["AI"]
    s.speakers = speakers or ["Alice"]
    return s


def _make_classification(
    template_name: str = "lecture",
    confidence: float = 0.9,
):
    c = MagicMock()
    c.template_name = template_name
    c.confidence = confidence
    return c


def _make_template(icon: str = "", display_name: str = ""):
    t = MagicMock()
    t.icon = icon
    t.display_name = display_name
    return t


# ---------------------------------------------------------------------------
# VaultAdapter — get_export_path
# ---------------------------------------------------------------------------


class TestVaultAdapterGetExportPath:
    """Test date-based folder structure path generation."""

    @patch("src.services.storage.export.get_settings")
    def test_date_based_path(self, mock_settings):
        mock_settings.return_value.obsidian_vault_path = ""
        mock_settings.return_value.obsidian_export_folder = "VoiceVault/Recordings"
        mock_settings.return_value.exports_dir = "/tmp/exports"

        adapter = VaultAdapter()
        recording = _make_recording()
        path = adapter.get_export_path(recording, "lecture")

        assert "2026-02-10" in str(path)
        assert "[lecture]" in str(path)
        assert "Test Recording" in str(path)
        assert "10:30" in str(path) or "1030" in str(path)
        assert str(path).endswith(".md")

    @patch("src.services.storage.export.get_settings")
    def test_custom_vault_root(self, mock_settings):
        mock_settings.return_value.obsidian_vault_path = ""
        mock_settings.return_value.obsidian_export_folder = "VoiceVault"
        mock_settings.return_value.exports_dir = "/tmp/exports"

        vault_root = Path("/tmp/my-vault")
        adapter = VaultAdapter(vault_root=vault_root)
        recording = _make_recording()
        path = adapter.get_export_path(recording, "memo")

        assert str(path).startswith("/tmp/my-vault")

    @patch("src.services.storage.export.get_settings")
    def test_custom_title(self, mock_settings):
        mock_settings.return_value.obsidian_vault_path = ""
        mock_settings.return_value.obsidian_export_folder = "VoiceVault"
        mock_settings.return_value.exports_dir = "/tmp/exports"

        adapter = VaultAdapter()
        recording = _make_recording()
        path = adapter.get_export_path(recording, "lecture", title="Custom Title")

        assert "Custom Title" in str(path)


# ---------------------------------------------------------------------------
# VaultAdapter — ensure_folder_structure
# ---------------------------------------------------------------------------


class TestVaultAdapterEnsureFolderStructure:
    @patch("src.services.storage.export.get_settings")
    def test_creates_folder(self, mock_settings, tmp_path):
        mock_settings.return_value.obsidian_vault_path = ""
        mock_settings.return_value.obsidian_export_folder = "VoiceVault"
        mock_settings.return_value.exports_dir = str(tmp_path)

        adapter = VaultAdapter()
        adapter.ensure_folder_structure("2026-02-10")

        expected = tmp_path / "VoiceVault" / "2026-02-10"
        assert expected.is_dir()


# ---------------------------------------------------------------------------
# VaultAdapter — write_markdown
# ---------------------------------------------------------------------------


class TestVaultAdapterWriteMarkdown:
    @patch("src.services.storage.export.get_settings")
    def test_writes_file(self, mock_settings, tmp_path):
        mock_settings.return_value.obsidian_vault_path = ""
        mock_settings.return_value.obsidian_export_folder = "VoiceVault"
        mock_settings.return_value.exports_dir = str(tmp_path)

        adapter = VaultAdapter()
        path = tmp_path / "test.md"
        adapter.write_markdown(path, "# Hello\n\nContent")

        assert path.exists()
        assert path.read_text() == "# Hello\n\nContent"

    @patch("src.services.storage.export.get_settings")
    def test_overwrite_true_replaces(self, mock_settings, tmp_path):
        mock_settings.return_value.obsidian_vault_path = ""
        mock_settings.return_value.obsidian_export_folder = "VoiceVault"
        mock_settings.return_value.exports_dir = str(tmp_path)

        adapter = VaultAdapter()
        path = tmp_path / "test.md"
        path.write_text("old content")
        adapter.write_markdown(path, "new content", overwrite=True)

        assert path.read_text() == "new content"

    @patch("src.services.storage.export.get_settings")
    def test_overwrite_false_skips(self, mock_settings, tmp_path):
        mock_settings.return_value.obsidian_vault_path = ""
        mock_settings.return_value.obsidian_export_folder = "VoiceVault"
        mock_settings.return_value.exports_dir = str(tmp_path)

        adapter = VaultAdapter()
        path = tmp_path / "test.md"
        path.write_text("old content")
        adapter.write_markdown(path, "new content", overwrite=False)

        assert path.read_text() == "old content"

    @patch("src.services.storage.export.get_settings")
    def test_creates_parent_dirs(self, mock_settings, tmp_path):
        mock_settings.return_value.obsidian_vault_path = ""
        mock_settings.return_value.obsidian_export_folder = "VoiceVault"
        mock_settings.return_value.exports_dir = str(tmp_path)

        adapter = VaultAdapter()
        path = tmp_path / "deep" / "nested" / "dir" / "test.md"
        adapter.write_markdown(path, "content")

        assert path.exists()


# ---------------------------------------------------------------------------
# build_standardized_frontmatter
# ---------------------------------------------------------------------------


class TestStandardizedFrontmatter:
    def test_required_fields_present(self):
        recording = _make_recording()
        fm = build_standardized_frontmatter(recording, None, None, [])

        required_keys = [
            "id", "title", "date", "time", "duration_minutes",
            "type", "created_by", "exported_at", "source_db_id",
        ]
        for key in required_keys:
            assert key in fm, f"Missing required key: {key}"

    def test_optional_fields_present(self):
        recording = _make_recording()
        summary = _make_summary(keywords=["ML", "AI"], speakers=["Bob"])
        classification = _make_classification()

        fm = build_standardized_frontmatter(recording, classification, None, [summary])

        assert "speakers" in fm
        assert "keywords" in fm
        assert "confidence" in fm
        assert "tags" in fm
        assert "related" in fm

    def test_values_correct(self):
        recording = _make_recording(id=42, title="My Lecture", total_minutes=90)
        classification = _make_classification(template_name="lecture", confidence=0.85)
        summary = _make_summary(keywords=["AI", "ML"], speakers=["Alice", "Bob"])

        fm = build_standardized_frontmatter(recording, classification, None, [summary])

        assert fm["id"] == 42
        assert fm["date"] == "2026-02-10"
        assert fm["time"] == "10:30"
        assert fm["duration_minutes"] == 90
        assert fm["type"] == "lecture"
        assert fm["created_by"] == "VoiceVault"
        assert fm["source_db_id"] == 42
        assert fm["confidence"] == 0.85
        assert "AI" in fm["keywords"]
        assert "Alice" in fm["speakers"]

    def test_no_classification_defaults(self):
        recording = _make_recording()
        fm = build_standardized_frontmatter(recording, None, None, [])

        assert fm["type"] == "memo"
        assert fm["confidence"] == 0.0
