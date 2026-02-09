"""
RAG REST endpoints.

Provides reindex and future RAG query endpoints.
"""

import logging

from fastapi import APIRouter
from pydantic import BaseModel, Field

from src.core.config import get_settings
from src.services.rag import create_embedding, create_vectorstore
from src.services.storage.database import get_session
from src.services.storage.repository import RecordingRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rag", tags=["rag"])


class ReindexResponse(BaseModel):
    """Response from a reindex operation."""

    reindexed: int = 0
    errors: int = 0
    total_in_store: int = 0


class ReindexDetailResponse(BaseModel):
    """Detailed response from a reindex operation."""

    status: str = "completed"
    result: ReindexResponse = Field(default_factory=ReindexResponse)


@router.post("/reindex", response_model=ReindexDetailResponse)
async def reindex_summaries():
    """Rebuild the vector index from all existing summaries in the database."""
    settings = get_settings()
    embedding = create_embedding(provider=settings.embedding_provider)
    vectorstore = create_vectorstore()

    reindexed = 0
    errors = 0

    async with get_session() as session:
        repo = RecordingRepository(session)
        recordings = await repo.list_recordings(limit=10000)

        for recording in recordings:
            summaries = await repo.list_summaries(recording.id)
            for summary in summaries:
                try:
                    vector = await embedding.embed(summary.summary_text)
                    doc_id = f"summary-{summary.recording_id}-{summary.minute_index}"
                    metadata = {
                        "recording_id": summary.recording_id,
                        "minute_index": summary.minute_index,
                        "date": summary.created_at.isoformat() if summary.created_at else "",
                        "keywords": ",".join(summary.keywords) if summary.keywords else "",
                    }
                    await vectorstore.add(
                        doc_id=doc_id,
                        text=summary.summary_text,
                        embedding=vector,
                        metadata=metadata,
                    )
                    reindexed += 1
                except Exception:
                    logger.warning(
                        "Failed to reindex summary %s (recording=%s, minute=%s)",
                        summary.id,
                        summary.recording_id,
                        summary.minute_index,
                    )
                    errors += 1

    total = await vectorstore.count()

    return ReindexDetailResponse(
        status="completed",
        result=ReindexResponse(
            reindexed=reindexed,
            errors=errors,
            total_in_store=total,
        ),
    )
