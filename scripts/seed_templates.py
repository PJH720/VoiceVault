#!/usr/bin/env python3
"""
VoiceVault Template Seeder

Reads JSON template files from the ``templates/`` directory and inserts
them into the database.  Existing templates (by name) are skipped so the
script is safe to run multiple times (idempotent).
"""

import asyncio
import json
import sys
from pathlib import Path

# Ensure project root is on sys.path for ``src`` imports
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.services.storage.database import get_session, init_db  # noqa: E402
from src.services.storage.repository import RecordingRepository  # noqa: E402

TEMPLATES_DIR = PROJECT_ROOT / "templates"


async def seed() -> int:
    """Load all JSON template files from ``templates/`` into the database.

    Each JSON file is expected to contain at minimum a ``name`` field.
    Templates already present in the DB (matched by name) are skipped,
    making this function idempotent.

    Returns:
        Exit code: 0 on success, 1 if the templates directory is missing.
    """
    await init_db()

    if not TEMPLATES_DIR.is_dir():
        print(f"Templates directory not found: {TEMPLATES_DIR}")
        return 1

    json_files = sorted(TEMPLATES_DIR.glob("*.json"))
    if not json_files:
        print("No JSON template files found.")
        return 0

    created = 0
    skipped = 0

    async with get_session() as session:
        repo = RecordingRepository(session)

        for path in json_files:
            with open(path) as f:
                data = json.load(f)

            name = data["name"]
            # Idempotent: skip if a template with this name already exists
            existing = await repo.get_template_by_name(name)
            if existing is not None:
                print(f"  SKIP  {name} (already exists)")
                skipped += 1
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
            # Mark as the fallback template when no classification matches
            if data.get("is_default", False):
                template.is_default = True
                await session.flush()

            print(f"  ADD   {name} (id={template.id})")
            created += 1

    print(f"\nDone: {created} created, {skipped} skipped.")
    return 0


def main() -> int:
    """CLI entry point — print header and run the async seed coroutine."""
    print("VoiceVault Template Seeder")
    print(f"Templates dir: {TEMPLATES_DIR}\n")
    return asyncio.run(seed())


if __name__ == "__main__":
    sys.exit(main())
