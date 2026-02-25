"""
Obsidian-compatible Markdown export for VoiceVault recordings.

Generates Markdown files with YAML frontmatter, template-driven body,
RAG-powered wikilinks, and collapsible transcript sections.
"""

from __future__ import annotations

import logging
import re
import shutil
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import get_settings
from src.core.exceptions import ExportError
from src.core.models import ObsidianExportRequest, ObsidianExportResponse
from src.services.rag.retriever import RAGRetriever
from src.services.storage.models_db import (
    Classification,
    HourSummary,
    Recording,
    Summary,
    Template,
    Transcript,
)
from src.services.storage.repository import RecordingRepository

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# VaultAdapter — standardized vault file management
# ---------------------------------------------------------------------------


class VaultAdapter:
    """Manages Obsidian vault file I/O with standardized folder structure.

    Encapsulates vault path resolution, folder creation, and file writing
    for Obsidian-compatible Markdown exports.

    Folder structure: ``{vault_root}/{export_folder}/YYYY-MM-DD/[분류] 제목 - HH:MM.md``
    """

    def __init__(self, vault_root: Path | None = None) -> None:
        settings = get_settings()
        self._vault_root = vault_root or (
            Path(settings.obsidian_vault_path) if settings.obsidian_vault_path else None
        )
        self._export_folder = settings.obsidian_export_folder

    def get_export_path(
        self,
        recording: Recording,
        classification_type: str,
        title: str | None = None,
    ) -> Path:
        """Build the full export file path with date-based folder structure.

        Pattern: ``VoiceVault/Recordings/YYYY-MM-DD/[분류] 제목 - HH:MM.md``
        """
        title_text = title or recording.title or "Untitled Recording"
        date_str = recording.started_at.strftime("%Y-%m-%d") if recording.started_at else "undated"
        time_str = recording.started_at.strftime("%H:%M") if recording.started_at else "00:00"

        safe_title = _sanitize_filename(title_text)
        filename = f"[{classification_type}] {safe_title} - {time_str}.md"
        filename = _sanitize_filename(filename)

        base = self._vault_root or Path(get_settings().exports_dir)
        return base / self._export_folder / date_str / filename

    def ensure_folder_structure(self, date_str: str) -> None:
        """Create the date-based folder if it doesn't exist."""
        base = self._vault_root or Path(get_settings().exports_dir)
        folder = base / self._export_folder / date_str
        folder.mkdir(parents=True, exist_ok=True)

    def write_markdown(self, path: Path, content: str, overwrite: bool = True) -> None:
        """Write Markdown content to the vault.

        Args:
            path: Target file path.
            content: Markdown string to write.
            overwrite: If False and file exists, skip writing.

        Raises:
            ExportError: If file writing fails.
        """
        if not overwrite and path.exists():
            logger.info("Skipping existing file: %s", path)
            return

        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            path.write_text(content, encoding="utf-8")
        except OSError as exc:
            raise ExportError(detail=f"Failed to write file: {exc}") from exc


def build_standardized_frontmatter(
    recording: Recording,
    classification: Classification | None,
    template: Template | None,
    summaries: list[Summary],
) -> dict[str, Any]:
    """Build ADR-002 §2.4 compliant frontmatter as a dictionary.

    Required fields: id, title, date, time, duration_minutes, type,
    created_by, exported_at, source_db_id.

    Optional fields: speakers, keywords, confidence, tags, related.
    """
    from datetime import UTC, datetime

    icon = _get_icon(template, classification)
    display_name = _get_display_name(template, classification)
    title_text = recording.title or "Untitled Recording"
    category = classification.template_name if classification else "memo"

    all_keywords: list[str] = []
    all_speakers: list[str] = []
    for s in summaries:
        if s.keywords:
            for kw in s.keywords:
                if kw and kw not in all_keywords:
                    all_keywords.append(kw)
        if s.speakers:
            for sp in s.speakers:
                if sp and sp not in all_speakers:
                    all_speakers.append(sp)

    duration_minutes = recording.total_minutes or 0
    confidence = classification.confidence if classification else 0.0

    return {
        "id": recording.id,
        "title": f"{icon} {display_name} - {title_text}",
        "date": recording.started_at.strftime("%Y-%m-%d") if recording.started_at else "",
        "time": recording.started_at.strftime("%H:%M") if recording.started_at else "",
        "duration_minutes": duration_minutes,
        "type": category,
        "created_by": "VoiceVault",
        "exported_at": datetime.now(UTC).isoformat(),
        "source_db_id": recording.id,
        "speakers": all_speakers,
        "keywords": all_keywords[:20],
        "confidence": round(confidence, 2),
        "tags": all_keywords[:10],
        "related": [],
    }


# Icon mapping for template names without a stored icon
_DEFAULT_ICONS: dict[str, str] = {
    "lecture": "\U0001f4da",
    "meeting": "\U0001f91d",
    "conversation": "\U0001f4ac",
    "memo": "\U0001f4a1",
}

# Field label emoji mapping
_FIELD_ICONS: dict[str, str] = {
    "summary": "\U0001f4dd",
    "key_concepts": "\U0001f4a1",
    "examples": "\U0001f4cb",
    "questions": "\u2753",
    "decisions": "\u2705",
    "action_items": "\U0001f4cc",
    "participants": "\U0001f465",
    "topics": "\U0001f4ac",
    "mood": "\U0001f3ad",
    "key_points": "\U0001f4a1",
    "references": "\U0001f4da",
}


def _sanitize_filename(name: str) -> str:
    """Remove characters unsafe for file paths (Windows + Unix).

    Args:
        name: Raw filename string potentially containing unsafe characters.

    Returns:
        Sanitized filename safe for all major operating systems.
    """
    sanitized = re.sub(r'[<>:"/\\|?*]', "", name)
    sanitized = sanitized.strip(". ")
    return sanitized or "untitled"


def _get_icon(template: Template | None, classification: Classification | None) -> str:
    """Resolve an icon for the export title."""
    if template and template.icon:
        return template.icon
    if classification:
        return _DEFAULT_ICONS.get(classification.template_name, "\U0001f4a1")
    return "\U0001f4a1"


def _get_display_name(template: Template | None, classification: Classification | None) -> str:
    """Resolve a display name for the export."""
    if template and template.display_name:
        return template.display_name
    if classification:
        return classification.template_name.replace("_", " ").title()
    return "Memo"


def _build_frontmatter(
    recording: Recording,
    classification: Classification | None,
    template: Template | None,
    summaries: list[Summary],
) -> str:
    """Build YAML frontmatter for Obsidian export.

    Generates structured metadata including title, date, category, tags,
    keywords, speakers, and recording ID. Obsidian uses frontmatter for
    Dataview queries and graph view filtering.

    Returns:
        A ``---``-delimited YAML frontmatter string.
    """
    icon = _get_icon(template, classification)
    display_name = _get_display_name(template, classification)
    title_text = recording.title or "Untitled Recording"
    title = f"{icon} {display_name} - {title_text}"

    category = classification.template_name if classification else "memo"

    # Aggregate keywords and speakers from all summaries
    all_keywords: list[str] = []
    all_speakers: list[str] = []
    for s in summaries:
        if s.keywords:
            for kw in s.keywords:
                if kw and kw not in all_keywords:
                    all_keywords.append(kw)
        if s.speakers:
            for sp in s.speakers:
                if sp and sp not in all_speakers:
                    all_speakers.append(sp)

    # Compute duration
    duration = ""
    if recording.total_minutes:
        hours, mins = divmod(recording.total_minutes, 60)
        duration = f"{hours:02d}:{mins:02d}:00"

    confidence = classification.confidence if classification else 0.0

    fm: dict[str, Any] = {
        "title": title,
        "date": recording.started_at.isoformat() if recording.started_at else "",
        "type": category,
        "category": category,
        "tags": all_keywords[:10],
        "keywords": all_keywords[:20],
        "speakers": all_speakers,
        "recording_id": recording.id,
        "confidence": round(confidence, 2),
    }
    if duration:
        fm["duration"] = duration

    yaml_str: str = yaml.dump(fm, allow_unicode=True, default_flow_style=False)
    return "---\n" + yaml_str.strip() + "\n---"


def _build_body(
    recording: Recording,
    classification: Classification | None,
    template: Template | None,
    summaries: list[Summary],
    hour_summaries: list[HourSummary],
) -> str:
    """Build template-driven body from classification result and summaries.

    If a template with fields is available, each field from the classification
    result is rendered as a Markdown section. Otherwise, falls back to a
    simple bullet-list of minute summaries.
    """
    sections: list[str] = []

    result_json: dict = {}
    if classification and classification.result_json:
        result_json = classification.result_json

    fields: list[dict] = []
    if template and template.fields:
        fields = template.fields

    if fields and result_json:
        for field in fields:
            field_name = field.get("name", "")
            field_label = field.get("label", field_name)
            field_type = field.get("type", "text")
            field_icon = _FIELD_ICONS.get(field_name, "")
            heading = f"## {field_icon} {field_label}".strip()

            value = result_json.get(field_name)
            if value is None:
                continue

            if field_type == "list" and isinstance(value, list):
                items = "\n".join(f"- {item}" for item in value if item)
                if items:
                    sections.append(f"{heading}\n\n{items}")
            elif isinstance(value, str) and value.strip():
                sections.append(f"{heading}\n\n{value}")
    else:
        # Fallback: concatenate summaries
        if summaries:
            summary_lines = "\n".join(f"- {s.summary_text}" for s in summaries if s.summary_text)
            if summary_lines:
                sections.append(f"## \U0001f4dd \uc694\uc57d\n\n{summary_lines}")

    # Append hour summaries if available
    if hour_summaries:
        hour_parts: list[str] = []
        for hs in hour_summaries:
            hour_parts.append(f"### Hour {hs.hour_index}\n\n{hs.summary_text}")
        sections.append(
            "## \U0001f552 \uc2dc\uac04\ubcc4 \uc694\uc57d\n\n" + "\n\n".join(hour_parts)
        )

    return "\n\n".join(sections)


async def _build_wikilinks(
    recording_id: int,
    retriever: RAGRetriever | None,
) -> str:
    """Build a Related Notes section with ``[[wikilinks]]`` from RAG similarity.

    Uses the RAG retriever to find the top 3 semantically similar recordings
    and generates Obsidian wikilinks to them.

    Args:
        recording_id: The current recording being exported.
        retriever: RAG retriever for similarity search (None = skip).

    Returns:
        Markdown section string, or empty string if no similar recordings found.
    """
    if retriever is None:
        return ""

    try:
        similar = await retriever.find_similar(recording_id=recording_id, top_k=3)
    except Exception:
        logger.warning("Failed to fetch similar recordings for wikilinks", exc_info=True)
        return ""

    if not similar:
        return ""

    links: list[str] = []
    for src in similar:
        link_name = f"Recording {src.recording_id} - {src.date}"
        links.append(f"- [[{link_name}]]")

    return "## \U0001f517 Related Notes\n\n" + "\n".join(links)


def _build_transcript_section(transcripts: list[Transcript]) -> str:
    """Build a collapsible HTML ``<details>`` section with timestamped transcripts.

    Each transcript is prefixed with its minute timestamp (e.g. [05:00]).
    """
    if not transcripts:
        return ""

    lines: list[str] = []
    for t in transcripts:
        minutes = t.minute_index
        timestamp = f"[{minutes:02d}:00]"
        lines.append(f"{timestamp} {t.text}")

    content = "\n\n".join(lines)
    return f"<details>\n<summary>\U0001f4cb Full Transcript</summary>\n\n{content}\n\n</details>"


async def export_recording_to_markdown(
    recording_id: int,
    request: ObsidianExportRequest | None,
    session: AsyncSession,
    retriever: RAGRetriever | None = None,
) -> ObsidianExportResponse:
    """Export a recording as Obsidian-compatible Markdown.

    Args:
        recording_id: The recording to export.
        request: Export options (format, include_transcript, vault_path).
        session: Active async database session.
        retriever: Optional RAG retriever for wikilinks generation.

    Returns:
        ObsidianExportResponse with file path, content, and frontmatter.

    Raises:
        ExportError: If the export process fails.
    """
    settings = get_settings()
    if request is None:
        request = ObsidianExportRequest()

    try:
        repo = RecordingRepository(session)
        recording = await repo.get_recording(recording_id)
        summaries = await repo.list_summaries(recording_id)
        transcripts = await repo.list_transcripts(recording_id)
        hour_summaries = await repo.list_hour_summaries(recording_id)
        classifications = await repo.list_classifications(recording_id)
    except Exception as exc:
        raise ExportError(detail=f"Failed to load recording data: {exc}") from exc

    # Pick primary classification (highest confidence)
    classification: Classification | None = None
    if classifications:
        classification = max(classifications, key=lambda c: c.confidence)

    # Load template from DB
    template: Template | None = None
    if classification:
        template = await repo.get_template_by_name(classification.template_name)

    # If no template found, try "memo" default
    if template is None:
        template = await repo.get_template_by_name("memo")

    # Build markdown parts
    parts: list[str] = []

    fm_text = ""
    if settings.obsidian_frontmatter:
        fm_text = _build_frontmatter(recording, classification, template, summaries)
        parts.append(fm_text)

    body = _build_body(recording, classification, template, summaries, hour_summaries)
    if body:
        parts.append(body)

    # Wikilinks (RAG similarity)
    if settings.obsidian_wikilinks and retriever is not None:
        wikilinks = await _build_wikilinks(recording_id, retriever)
        if wikilinks:
            parts.append(wikilinks)

    # Transcript
    if request.include_transcript:
        transcript_section = _build_transcript_section(transcripts)
        if transcript_section:
            parts.append(transcript_section)

    markdown_content = "\n\n".join(parts) + "\n"

    # Generate filename
    icon = _get_icon(template, classification)
    display_name = _get_display_name(template, classification)
    title_text = recording.title or "Untitled Recording"
    date_str = recording.started_at.strftime("%Y-%m-%d") if recording.started_at else "undated"
    raw_filename = f"{icon} {display_name} - {title_text} - {date_str}.md"
    filename = _sanitize_filename(raw_filename)

    # Write to exports_dir
    exports_dir = Path(settings.exports_dir)
    exports_dir.mkdir(parents=True, exist_ok=True)
    file_path = exports_dir / filename

    try:
        file_path.write_text(markdown_content, encoding="utf-8")
    except OSError as exc:
        raise ExportError(detail=f"Failed to write export file: {exc}") from exc

    # Optionally copy to Obsidian vault
    vault_path = request.vault_path or settings.obsidian_vault_path
    if vault_path:
        vault_dir = Path(vault_path) / settings.obsidian_export_folder
        vault_dir.mkdir(parents=True, exist_ok=True)
        try:
            shutil.copy2(str(file_path), str(vault_dir / filename))
        except OSError:
            logger.warning("Failed to copy export to vault path", exc_info=True)

    # Update classification export_path in DB
    if classification:
        classification.export_path = str(file_path)
        await session.flush()

    # Parse frontmatter dict for response (reuse already-generated fm_text)
    fm_dict: dict = {}
    if fm_text:
        fm_body = fm_text.strip().removeprefix("---").removesuffix("---").strip()
        try:
            fm_dict = yaml.safe_load(fm_body) or {}
        except yaml.YAMLError:
            fm_dict = {}

    return ObsidianExportResponse(
        file_path=str(file_path),
        markdown_content=markdown_content,
        frontmatter=fm_dict,
    )
