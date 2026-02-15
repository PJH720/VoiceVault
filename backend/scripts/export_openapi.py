#!/usr/bin/env python3
"""Export the VoiceVault FastAPI OpenAPI schema to JSON.

Usage:
    PYTHONPATH=backend python backend/scripts/export_openapi.py [OUTPUT_PATH]

    OUTPUT_PATH defaults to ``docs/openapi.json`` (relative to repo root).

Prerequisites:
    - Python 3.12 with project dependencies installed (``uv pip install -r requirements.txt``)
    - Run from the repository root directory
    - PYTHONPATH must include ``backend/`` so that ``src.*`` imports resolve

The script imports the FastAPI app, calls ``app.openapi()`` to obtain the
schema dict, and writes it as pretty-printed JSON.  No server is started
and no database connection is made — only the route metadata is read.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> None:
    from src.api.app import create_app

    output_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("docs/openapi.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    app = create_app()
    schema = app.openapi()

    output_path.write_text(json.dumps(schema, indent=2, ensure_ascii=False) + "\n")
    print(f"OpenAPI schema written to {output_path} ({output_path.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
