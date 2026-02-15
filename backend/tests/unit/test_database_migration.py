"""Tests for idempotent column migrations in init_db().

Verifies that _apply_migrations() correctly adds missing columns
(recordings.context, summaries.corrections) to pre-existing databases
without breaking fresh databases or losing existing data.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from src.services.storage.database import init_db


def _column_names(rows: list) -> set[str]:
    """Extract column names from PRAGMA table_info result rows."""
    return {row[1] for row in rows}


@pytest.fixture
async def legacy_engine(tmp_path):
    """Create a DB with the old schema (no context/corrections columns)."""
    db_path = tmp_path / "legacy.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}", echo=False)
    async with engine.begin() as conn:
        # Create tables without the new columns (simulating pre-#50 schema)
        await conn.execute(
            text("""
            CREATE TABLE recordings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title VARCHAR(255),
                started_at DATETIME,
                ended_at DATETIME,
                audio_path VARCHAR(512),
                status VARCHAR(20) DEFAULT 'active',
                total_minutes INTEGER DEFAULT 0
            )
        """)
        )
        await conn.execute(
            text("""
            CREATE TABLE transcripts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recording_id INTEGER REFERENCES recordings(id),
                minute_index INTEGER,
                text TEXT DEFAULT '',
                confidence FLOAT DEFAULT 0.0,
                language VARCHAR(10) DEFAULT 'unknown',
                created_at DATETIME
            )
        """)
        )
        await conn.execute(
            text("""
            CREATE TABLE summaries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recording_id INTEGER REFERENCES recordings(id),
                minute_index INTEGER,
                summary_text TEXT DEFAULT '',
                keywords JSON DEFAULT '[]',
                speakers JSON DEFAULT '[]',
                confidence FLOAT DEFAULT 0.0,
                model_used VARCHAR(100) DEFAULT '',
                created_at DATETIME
            )
        """)
        )
        # Week 2 tables (these have no new columns to migrate)
        await conn.execute(
            text("""
            CREATE TABLE hour_summaries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recording_id INTEGER REFERENCES recordings(id),
                hour_index INTEGER,
                summary_text TEXT DEFAULT '',
                keywords JSON DEFAULT '[]',
                topic_segments JSON DEFAULT '[]',
                token_count INTEGER DEFAULT 0,
                model_used VARCHAR(100) DEFAULT '',
                created_at DATETIME
            )
        """)
        )
        await conn.execute(
            text("""
            CREATE TABLE templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(100) UNIQUE,
                display_name VARCHAR(255) DEFAULT '',
                triggers JSON DEFAULT '[]',
                output_format VARCHAR(50) DEFAULT 'markdown',
                fields JSON DEFAULT '[]',
                icon VARCHAR(10) DEFAULT '',
                priority INTEGER DEFAULT 0,
                is_default BOOLEAN DEFAULT 0,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME
            )
        """)
        )
        await conn.execute(
            text("""
            CREATE TABLE classifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recording_id INTEGER REFERENCES recordings(id),
                template_id INTEGER REFERENCES templates(id),
                template_name VARCHAR(100) DEFAULT '',
                start_minute INTEGER DEFAULT 0,
                end_minute INTEGER DEFAULT 0,
                confidence FLOAT DEFAULT 0.0,
                result_json JSON DEFAULT '{}',
                export_path VARCHAR(512),
                created_at DATETIME
            )
        """)
        )
        await conn.execute(
            text("""
            CREATE TABLE rag_queries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                query_text TEXT DEFAULT '',
                results_json JSON DEFAULT '[]',
                model_used VARCHAR(100) DEFAULT '',
                answer_text TEXT DEFAULT '',
                sources JSON DEFAULT '[]',
                created_at DATETIME
            )
        """)
        )
    yield engine
    await engine.dispose()


@pytest.mark.asyncio
async def test_adds_missing_columns_to_legacy_db(legacy_engine):
    """init_db() should add context and corrections to a pre-#50 database."""
    await init_db(legacy_engine)

    async with legacy_engine.connect() as conn:
        rec_cols = _column_names(
            (await conn.execute(text("PRAGMA table_info(recordings)"))).fetchall()
        )
        sum_cols = _column_names(
            (await conn.execute(text("PRAGMA table_info(summaries)"))).fetchall()
        )

    assert "context" in rec_cols
    assert "corrections" in sum_cols


@pytest.mark.asyncio
async def test_idempotent_on_fresh_db(tmp_path):
    """Calling init_db() twice on the same engine should not error."""
    db_path = tmp_path / "fresh.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}", echo=False)
    try:
        await init_db(engine)
        await init_db(engine)  # second call must not raise

        async with engine.connect() as conn:
            rec_cols = _column_names(
                (await conn.execute(text("PRAGMA table_info(recordings)"))).fetchall()
            )
            sum_cols = _column_names(
                (await conn.execute(text("PRAGMA table_info(summaries)"))).fetchall()
            )

        assert "context" in rec_cols
        assert "corrections" in sum_cols
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_existing_data_preserved(legacy_engine):
    """Existing rows survive the migration and new columns default to NULL."""
    # Insert a row before migration
    async with legacy_engine.begin() as conn:
        await conn.execute(
            text(
                "INSERT INTO recordings (title, status, total_minutes)"
                " VALUES ('before migration', 'completed', 5)"
            )
        )

    await init_db(legacy_engine)

    async with legacy_engine.connect() as conn:
        row = (
            await conn.execute(text("SELECT title, status, context FROM recordings WHERE id = 1"))
        ).fetchone()

    assert row is not None
    assert row[0] == "before migration"
    assert row[1] == "completed"
    assert row[2] is None  # new column defaults to NULL
