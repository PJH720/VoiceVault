#!/usr/bin/env python3
"""
VoiceVault Demo Data Seeder

Seeds the 8-hour demo scenario (4 segments) into DB, ChromaDB, and
Obsidian Markdown exports.  All demo recordings use the ``[DEMO]``
title prefix for idempotent management.

Usage:
    python scripts/seed_demo_data.py          # Seed (skip if exists)
    python scripts/seed_demo_data.py --clean  # Delete existing + re-seed
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from datetime import datetime
from pathlib import Path

# Ensure project root is on sys.path for ``src`` imports
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from sqlalchemy import select  # noqa: E402

from scripts.demo_data.scenarios import (  # noqa: E402
    SCENARIOS,
    generate_all_summaries,
    generate_all_transcripts,
)
from src.core.config import get_settings  # noqa: E402
from src.services.storage.database import get_session, init_db  # noqa: E402
from src.services.storage.models_db import Recording  # noqa: E402
from src.services.storage.repository import RecordingRepository  # noqa: E402

logger = logging.getLogger(__name__)

DEMO_PREFIX = "[DEMO]"


# ------------------------------------------------------------------
# Template seeding (inline, avoids subprocess)
# ------------------------------------------------------------------

async def _ensure_templates(repo: RecordingRepository) -> None:
    """Load default classification templates from JSON files into the DB.

    Iterates over ``templates/*.json`` and inserts any template whose name
    does not already exist. This avoids a subprocess call to
    ``seed_templates.py`` while achieving the same result.

    Args:
        repo: Active repository instance bound to a DB session.
    """
    import json

    templates_dir = PROJECT_ROOT / "templates"
    if not templates_dir.is_dir():
        print("  WARN  templates/ directory not found, skipping template seeding")
        return

    for path in sorted(templates_dir.glob("*.json")):
        with open(path) as f:
            data = json.load(f)
        name = data["name"]
        # Skip templates that already exist (idempotent)
        existing = await repo.get_template_by_name(name)
        if existing is not None:
            continue
        template = await repo.create_template(
            name=name,
            display_name=data.get("display_name", ""),
            triggers=data.get("triggers", []),
            output_format=data.get("output_format", "markdown"),
            fields=data.get("fields", []),
            icon=data.get("icon", ""),
            priority=data.get("priority", 0),
        )
        # Mark as the fallback template when no other template matches
        if data.get("is_default", False):
            template.is_default = True
        print(f"  TEMPLATE  {name} (id={template.id})")


# ------------------------------------------------------------------
# Cleanup
# ------------------------------------------------------------------

async def _clean_demo_data() -> int:
    """Delete all ``[DEMO]`` recordings, their ChromaDB embeddings, and export files.

    Cleanup order:
        1. Remove embeddings from ChromaDB (best-effort, non-fatal on failure).
        2. Delete DB rows — cascade removes transcripts, summaries, classifications.
        3. Remove Obsidian Markdown export files whose names contain ``[DEMO]``.

    Returns:
        Number of recording rows deleted from the database.
    """
    settings = get_settings()
    deleted = 0

    async with get_session() as session:
        repo = RecordingRepository(session)

        # Query all recordings whose title starts with the demo prefix
        stmt = select(Recording).where(Recording.title.like(f"{DEMO_PREFIX}%"))
        result = await session.execute(stmt)
        demo_recordings = list(result.scalars().all())

        if not demo_recordings:
            print("  No existing demo data to clean.")
            return 0

        # Step 1: remove vector embeddings (best-effort)
        try:
            from src.services.rag import create_vectorstore

            vectorstore = create_vectorstore()
            for rec in demo_recordings:
                summaries = await repo.list_summaries(rec.id)
                for s in summaries:
                    # doc_id mirrors the format used during embedding
                    doc_id = f"summary-{rec.id}-{s.minute_index}"
                    try:
                        await vectorstore.delete(doc_id)
                    except Exception:
                        pass  # Individual deletion failures are non-critical
            print(f"  ChromaDB  cleaned embeddings for {len(demo_recordings)} recordings")
        except Exception as exc:
            print(f"  WARN  ChromaDB cleanup skipped: {exc}")

        # Step 2: delete DB records (cascade handles child rows)
        for rec in demo_recordings:
            await repo.delete_recording(rec.id)
            print(f"  DELETE  {rec.title} (id={rec.id})")
            deleted += 1

    # Step 3: remove exported Markdown files containing the demo prefix
    exports_dir = Path(settings.exports_dir)
    if exports_dir.is_dir():
        for f in exports_dir.iterdir():
            if DEMO_PREFIX in f.name:
                f.unlink()
                print(f"  DELETE  export: {f.name}")

    return deleted


# ------------------------------------------------------------------
# Seed one scenario
# ------------------------------------------------------------------

async def _seed_scenario(
    scenario: dict,
    index: int,
    total: int,
) -> int:
    """Insert a single demo scenario into the database.

    Creates the recording row plus all child data (transcripts, summaries,
    hour summaries, and classification) in one session.

    Args:
        scenario: Scenario dict from ``SCENARIOS`` containing metadata and content.
        index: Zero-based position of this scenario in the batch (for progress display).
        total: Total number of scenarios being seeded.

    Returns:
        The auto-generated ``recording.id`` for the newly inserted recording.
    """
    label = f"[{index + 1}/{total}]"  # e.g. "[1/4]" for progress output
    title = scenario["title"]

    async with get_session() as session:
        repo = RecordingRepository(session)

        # 1. Create the parent recording row and set its timestamps
        recording = await repo.create_recording(title=title)
        recording.started_at = datetime.fromisoformat(scenario["started_at"])
        recording.ended_at = datetime.fromisoformat(scenario["ended_at"])
        recording.status = "completed"
        recording.total_minutes = scenario["total_minutes"]
        await session.flush()  # Flush to generate the recording.id
        rec_id = recording.id
        print(f"  {label} Recording: {title} (id={rec_id})")

        # 2. Generate per-minute transcripts (key + interpolated filler)
        all_transcripts = generate_all_transcripts(scenario)
        for t in all_transcripts:
            await repo.create_transcript(
                recording_id=rec_id,
                minute_index=t["minute_index"],
                text=t["text"],
                confidence=t.get("confidence", 0.85),
                language=t.get("language", "ko"),
            )
        print(f"  {label} Transcripts: {len(all_transcripts)}")

        # 3. Generate per-minute summaries (key + interpolated filler)
        all_summaries = generate_all_summaries(scenario)
        for s in all_summaries:
            await repo.create_summary(
                recording_id=rec_id,
                minute_index=s["minute_index"],
                summary_text=s["summary_text"],
                keywords=s.get("keywords", []),
                speakers=s.get("speakers", []),
                confidence=0.85,
                model_used="demo-seed",
            )
        print(f"  {label} Summaries: {len(all_summaries)}")

        # 4. Hour summaries (only present for long recordings like the 5-hour study session)
        for hs in scenario.get("hour_summaries", []):
            await repo.create_hour_summary(
                recording_id=rec_id,
                hour_index=hs["hour_index"],
                summary_text=hs["summary_text"],
                keywords=hs.get("keywords", []),
                topic_segments=hs.get("topic_segments", []),
                token_count=hs.get("token_count", 0),
                model_used="demo-seed",
            )
        hour_count = len(scenario.get("hour_summaries", []))
        if hour_count:
            print(f"  {label} Hour summaries: {hour_count}")

        # 5. Classify the recording against its designated template
        template = await repo.get_template_by_name(scenario["template_name"])
        template_id = template.id if template else None
        await repo.create_classification(
            recording_id=rec_id,
            template_name=scenario["template_name"],
            start_minute=0,
            end_minute=scenario["total_minutes"] - 1,
            confidence=scenario["classification_confidence"],
            result_json=scenario["result_json"],
            template_id=template_id,
        )
        print(f"  {label} Classification: {scenario['template_name']} "
              f"({scenario['classification_confidence']:.0%})")

    return rec_id


# ------------------------------------------------------------------
# ChromaDB embedding
# ------------------------------------------------------------------

async def _embed_summaries(recording_ids: list[int]) -> int:
    """Embed all per-minute summaries into ChromaDB for RAG retrieval.

    For each recording, every summary is converted to a vector embedding and
    stored with metadata (recording_id, minute_index, category, keywords, etc.)
    so that the RAG pipeline can perform similarity search across demo data.

    Args:
        recording_ids: List of recording IDs whose summaries should be embedded.

    Returns:
        Total number of summaries successfully embedded.
    """
    try:
        from src.services.rag import create_embedding, create_vectorstore
    except ImportError as exc:
        print(f"  WARN  RAG modules not available, skipping embeddings: {exc}")
        return 0

    # First-time model download may be slow; notify the user
    print("\n  Loading embedding model (first run may download)...")
    settings = get_settings()
    embedder = create_embedding(settings.embedding_provider)
    vectorstore = create_vectorstore()

    embedded = 0

    for rec_id in recording_ids:
        # Fetch summaries and parent recording in a single session
        async with get_session() as session:
            repo = RecordingRepository(session)
            summaries = await repo.list_summaries(rec_id)
            recording = await repo.get_recording(rec_id)

        for s in summaries:
            # Unique document ID mirrors the cleanup logic in _clean_demo_data
            doc_id = f"summary-{rec_id}-{s.minute_index}"
            text = s.summary_text
            if not text:
                continue

            embedding = await embedder.embed(text)

            # Build metadata for filtered retrieval and citation display
            metadata = {
                "recording_id": rec_id,
                "minute_index": s.minute_index,
                "category": "",
                "keywords": ", ".join(s.keywords) if s.keywords else "",
                "speakers": ", ".join(s.speakers) if s.speakers else "",
                "confidence": s.confidence,
                "date": recording.started_at.isoformat() if recording.started_at else "",
            }

            # Attach the classification template name as the category
            async with get_session() as session:
                repo = RecordingRepository(session)
                classifications = await repo.list_classifications(rec_id)
                if classifications:
                    metadata["category"] = classifications[0].template_name

            await vectorstore.add(doc_id, text, embedding, metadata)
            embedded += 1

        print(f"  Embedded {len(summaries)} summaries for recording {rec_id}")

    total_count = await vectorstore.count()
    print(f"  ChromaDB total documents: {total_count}")
    return embedded


# ------------------------------------------------------------------
# Obsidian export
# ------------------------------------------------------------------

async def _export_recordings(recording_ids: list[int]) -> int:
    """Export demo recordings as Obsidian-compatible Markdown files.

    Each recording is rendered to a ``.md`` file in the configured exports
    directory. Failures are logged but do not abort the remaining exports.

    Args:
        recording_ids: List of recording IDs to export.

    Returns:
        Number of recordings successfully exported.
    """
    from src.services.storage.export import export_recording_to_markdown

    exported = 0
    for rec_id in recording_ids:
        async with get_session() as session:
            try:
                result = await export_recording_to_markdown(
                    recording_id=rec_id,
                    request=None,
                    session=session,
                    retriever=None,
                )
                print(f"  Export: {result.file_path}")
                exported += 1
            except Exception as exc:
                print(f"  WARN  Export failed for recording {rec_id}: {exc}")

    return exported


# ------------------------------------------------------------------
# Main
# ------------------------------------------------------------------

async def seed(clean: bool = False) -> int:
    """Run the full 6-step demo data seeding pipeline.

    Steps:
        1. Initialize the database schema.
        2. Ensure classification templates are loaded.
        3. Optionally clean existing ``[DEMO]`` data (``--clean``).
        4. Insert all scenario recordings with transcripts and summaries.
        5. Embed summaries into ChromaDB for RAG.
        6. Export recordings as Obsidian Markdown.

    Args:
        clean: If True, delete existing demo data before re-seeding.

    Returns:
        Exit code (0 = success).
    """
    print("=" * 60)
    print("VoiceVault Demo Data Seeder")
    print("=" * 60)

    # 1. Init DB
    print("\n[1/6] Initializing database...")
    await init_db()

    # 2. Ensure templates
    print("\n[2/6] Checking templates...")
    async with get_session() as session:
        repo = RecordingRepository(session)
        await _ensure_templates(repo)

    # 3. Clean if requested
    if clean:
        print("\n[3/6] Cleaning existing demo data...")
        deleted = await _clean_demo_data()
        print(f"  Deleted {deleted} demo recording(s).")
    else:
        print("\n[3/6] Checking for existing demo data...")
        async with get_session() as session:
            stmt = select(Recording).where(Recording.title.like(f"{DEMO_PREFIX}%"))
            result = await session.execute(stmt)
            existing = result.scalars().all()
            if existing:
                titles = [r.title for r in existing]
                print(f"  Demo data already exists ({len(titles)} recording(s)):")
                for t in titles:
                    print(f"    - {t}")
                print("  Use --clean to delete and re-seed.")
                return 0

    # 4. Seed scenarios
    print(f"\n[4/6] Seeding {len(SCENARIOS)} scenarios...")
    recording_ids: list[int] = []
    for i, scenario in enumerate(SCENARIOS):
        rec_id = await _seed_scenario(scenario, i, len(SCENARIOS))
        recording_ids.append(rec_id)

    # 5. ChromaDB embeddings
    print("\n[5/6] Embedding summaries into ChromaDB...")
    embedded = await _embed_summaries(recording_ids)

    # 6. Obsidian export
    print("\n[6/6] Exporting as Obsidian Markdown...")
    exported = await _export_recordings(recording_ids)

    # Summary
    total_transcripts = sum(s["total_minutes"] for s in SCENARIOS)
    total_hours = sum(len(s.get("hour_summaries", [])) for s in SCENARIOS)

    print("\n" + "=" * 60)
    print("Seed Complete!")
    print("=" * 60)
    print(f"  Recordings:      {len(recording_ids)}")
    print(f"  Transcripts:     {total_transcripts}")
    print(f"  Summaries:       {total_transcripts}")
    print(f"  Hour summaries:  {total_hours}")
    print(f"  Classifications: {len(recording_ids)}")
    print(f"  Embeddings:      {embedded}")
    print(f"  Exports:         {exported}")
    print()

    return 0


def main() -> int:
    """CLI entry point — parse ``--clean`` flag and run the async seed pipeline."""
    parser = argparse.ArgumentParser(
        description="Seed VoiceVault demo data (8-hour simulation)"
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Delete existing [DEMO] data before seeding",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.WARNING)
    return asyncio.run(seed(clean=args.clean))


if __name__ == "__main__":
    sys.exit(main())
