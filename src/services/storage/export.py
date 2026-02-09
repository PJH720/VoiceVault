"""
Obsidian-compatible Markdown export (stub — full implementation in v0.2.0).
"""

from src.services.storage.models_db import Recording


async def export_recording_to_markdown(
    recording: Recording,
    output_dir: str | None = None,
) -> str:
    """Export a recording as Obsidian-compatible Markdown.

    Args:
        recording: The recording ORM object to export.
        output_dir: Directory to write the file to. Uses config default if None.

    Returns:
        The path to the generated Markdown file.

    Raises:
        NotImplementedError: Always — not yet implemented.
    """
    raise NotImplementedError("Markdown export is not yet implemented (v0.2.0)")


def _build_frontmatter(recording: Recording) -> str:
    """Build YAML frontmatter for Obsidian export."""
    raise NotImplementedError


def _build_summary_section(recording: Recording) -> str:
    """Build the summary section of the Markdown file."""
    raise NotImplementedError
