"""
Async SQLAlchemy engine, session factory, and DB lifecycle helpers.

All database access goes through ``get_session()`` which yields an
``AsyncSession`` that auto-commits on clean exit and rolls back on error.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from src.core.config import get_settings


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


# Module-level singletons (reset via ``reset_engine`` in tests).
_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine(url: str | None = None) -> AsyncEngine:
    """Return the cached async engine, creating it on first call.

    Args:
        url: Optional database URL override. Uses settings if not provided.

    Returns:
        The singleton ``AsyncEngine`` instance.
    """
    global _engine
    if _engine is None:
        db_url = url or get_settings().database_url
        _engine = create_async_engine(db_url, echo=False)
    return _engine


def get_session_factory(
    engine: AsyncEngine | None = None,
) -> async_sessionmaker[AsyncSession]:
    """Return the cached session factory, creating it on first call.

    Args:
        engine: Optional engine override (used in tests).

    Returns:
        The singleton ``async_sessionmaker`` bound to the engine.
    """
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            engine or get_engine(),
            expire_on_commit=False,
        )
    return _session_factory


@asynccontextmanager
async def get_session() -> AsyncIterator[AsyncSession]:
    """Yield an ``AsyncSession`` that commits on success, rolls back on error."""
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# Manual column migrations for schema evolution without a migration tool.
# Each tuple: (table_name, column_name, column_type_with_default)
_COLUMN_MIGRATIONS = [
    ("recordings", "context", "TEXT"),
    ("summaries", "corrections", "JSON DEFAULT '[]'"),
]


async def _apply_migrations(conn) -> None:
    """Add missing columns to existing tables (idempotent).

    Uses ALTER TABLE which silently fails if the column already exists
    (caught as OperationalError). Safe to run on every startup.
    """
    for table, column, col_type in _COLUMN_MIGRATIONS:
        try:
            await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
        except OperationalError:
            pass  # column already exists


async def init_db(engine: AsyncEngine | None = None) -> None:
    """Create all tables, then apply pending column migrations.

    Args:
        engine: Optional engine override (used in tests with in-memory SQLite).
    """
    eng = engine or get_engine()
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _apply_migrations(conn)


async def close_db() -> None:
    """Dispose the engine and reset module globals."""
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None


def reset_engine() -> None:
    """Reset module globals without disposing (test helper)."""
    global _engine, _session_factory
    _engine = None
    _session_factory = None
