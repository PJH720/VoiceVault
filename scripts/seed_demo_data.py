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
    """Ensure default templates exist in the DB."""
    import json

    templates_dir = PROJECT_ROOT / "templates"
    if not templates_dir.is_dir():
        print("  WARN  templates/ directory not found, skipping template seeding")
        return

    for path in sorted(templates_dir.glob("*.json")):
        with open(path) as f:
            data = json.load(f)
        name = data["name"]
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
        if data.get("is_default", False):
            template.is_default = True
        print(f"  TEMPLATE  {name} (id={template.id})")


# ------------------------------------------------------------------
# Cleanup
# ------------------------------------------------------------------

async def _clean_demo_data() -> int:
    """Delete all [DEMO] recordings and related data. Returns count deleted."""
    settings = get_settings()
    deleted = 0

    async with get_session() as session:
        repo = RecordingRepository(session)

        # Find [DEMO] recordings
        stmt = select(Recording).where(Recording.title.like(f"{DEMO_PREFIX}%"))
        result = await session.execute(stmt)
        demo_recordings = list(result.scalars().all())

        if not demo_recordings:
            print("  No existing demo data to clean.")
            return 0

        # Try to clean ChromaDB entries
        try:
            from src.services.rag import create_vectorstore

            vectorstore = create_vectorstore()
            for rec in demo_recordings:
                summaries = await repo.list_summaries(rec.id)
                for s in summaries:
                    doc_id = f"summary-{rec.id}-{s.minute_index}"
                    try:
                        await vectorstore.delete(doc_id)
                    except Exception:
                        pass
            print(f"  ChromaDB  cleaned embeddings for {len(demo_recordings)} recordings")
        except Exception as exc:
            print(f"  WARN  ChromaDB cleanup skipped: {exc}")

        # Delete DB records (cascade handles transcripts/summaries/etc.)
        for rec in demo_recordings:
            await repo.delete_recording(rec.id)
            print(f"  DELETE  {rec.title} (id={rec.id})")
            deleted += 1

    # Clean export files
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
    """Seed a single scenario into DB. Returns recording_id."""
    label = f"[{index + 1}/{total}]"
    title = scenario["title"]

    async with get_session() as session:
        repo = RecordingRepository(session)

        # 1. Create recording
        recording = await repo.create_recording(title=title)
        recording.started_at = datetime.fromisoformat(scenario["started_at"])
        recording.ended_at = datetime.fromisoformat(scenario["ended_at"])
        recording.status = "completed"
        recording.total_minutes = scenario["total_minutes"]
        await session.flush()
        rec_id = recording.id
        print(f"  {label} Recording: {title} (id={rec_id})")

        # 2. Transcripts
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

        # 3. Summaries
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

        # 4. Hour summaries
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

        # 5. Classification
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
    """Embed all summaries for the given recordings into ChromaDB."""
    try:
        from src.services.rag import create_embedding, create_vectorstore
    except ImportError as exc:
        print(f"  WARN  RAG modules not available, skipping embeddings: {exc}")
        return 0

    print("\n  Loading embedding model (first run may download)...")
    settings = get_settings()
    embedder = create_embedding(settings.embedding_provider)
    vectorstore = create_vectorstore()

    embedded = 0

    for rec_id in recording_ids:
        async with get_session() as session:
            repo = RecordingRepository(session)
            summaries = await repo.list_summaries(rec_id)
            recording = await repo.get_recording(rec_id)

        for s in summaries:
            doc_id = f"summary-{rec_id}-{s.minute_index}"
            text = s.summary_text
            if not text:
                continue

            embedding = await embedder.embed(text)

            metadata = {
                "recording_id": rec_id,
                "minute_index": s.minute_index,
                "category": "",
                "keywords": ", ".join(s.keywords) if s.keywords else "",
                "speakers": ", ".join(s.speakers) if s.speakers else "",
                "confidence": s.confidence,
                "date": recording.started_at.isoformat() if recording.started_at else "",
            }

            # Get category from classifications
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
    """Export recordings as Obsidian-compatible Markdown."""
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
    """Run the full demo data seeding pipeline."""
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
    """Entry point with CLI argument parsing."""
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
