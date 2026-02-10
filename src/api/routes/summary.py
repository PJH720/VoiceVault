"""
Summary REST endpoints.

Implements list-summaries, hour-summaries, and cross-boundary extraction.
"""

from collections import defaultdict

from fastapi import APIRouter, HTTPException

from src.core.config import get_settings
from src.core.models import (
    ExtractRangeRequest,
    ExtractRangeResponse,
    HourSummaryResponse,
    SummaryResponse,
)
from src.services.llm import create_llm
from src.services.storage.database import get_session
from src.services.storage.repository import RecordingRepository
from src.services.summarization import HourSummarizer, RangeExtractor

router = APIRouter(prefix="/recordings", tags=["summaries"])


def _group_by_hour(summaries) -> dict[int, list[str]]:
    """Group minute summaries into hour buckets.

    minute_index 0-59 -> hour 0, 60-119 -> hour 1, etc.
    """
    hours: dict[int, list[str]] = defaultdict(list)
    for s in summaries:
        hour_idx = s.minute_index // 60
        hours[hour_idx].append(s.summary_text)
    return dict(hours)


@router.get("/{recording_id}/summaries", response_model=list[SummaryResponse])
async def list_summaries(recording_id: int):
    """List 1-minute summaries for a recording."""
    async with get_session() as session:
        repo = RecordingRepository(session)
        # Verify recording exists (raises RecordingNotFoundError if not)
        await repo.get_recording(recording_id)
        summaries = await repo.list_summaries(recording_id)
    return [
        SummaryResponse(
            id=s.id,
            recording_id=s.recording_id,
            minute_index=s.minute_index,
            summary_text=s.summary_text,
            keywords=s.keywords or [],
            confidence=s.confidence,
            created_at=s.created_at,
        )
        for s in summaries
    ]


@router.get(
    "/{recording_id}/hour-summaries",
    response_model=list[HourSummaryResponse],
)
async def list_hour_summaries(recording_id: int):
    """List hour-level summaries for a recording.

    Returns cached hour summaries if available. Otherwise generates
    them on-demand from existing minute summaries using hierarchical
    compression.
    """
    async with get_session() as session:
        repo = RecordingRepository(session)
        await repo.get_recording(recording_id)
        hour_summaries = await repo.list_hour_summaries(recording_id)

        if not hour_summaries:
            summaries = await repo.list_summaries(recording_id)
            if not summaries:
                return []

            settings = get_settings()
            llm = create_llm(provider=settings.llm_provider)
            hour_summarizer = HourSummarizer(llm)

            hours = _group_by_hour(summaries)
            results = []
            for hour_idx in sorted(hours):
                result = await hour_summarizer.summarize_hour(
                    recording_id=recording_id,
                    hour_index=hour_idx,
                    minute_summaries=hours[hour_idx],
                )
                db_row = await repo.create_hour_summary(
                    recording_id=recording_id,
                    hour_index=hour_idx,
                    summary_text=result.summary_text,
                    keywords=result.keywords,
                    topic_segments=result.topic_segments,
                    token_count=result.token_count,
                    model_used=result.model_used,
                )
                results.append(db_row)
            hour_summaries = results

    return [
        HourSummaryResponse(
            id=hs.id,
            recording_id=hs.recording_id,
            hour_index=hs.hour_index,
            summary_text=hs.summary_text,
            keywords=hs.keywords or [],
            topic_segments=hs.topic_segments or [],
            token_count=hs.token_count,
            model_used=hs.model_used or "",
            created_at=hs.created_at,
        )
        for hs in hour_summaries
    ]


@router.post(
    "/{recording_id}/extract",
    response_model=ExtractRangeResponse,
)
async def extract_range(recording_id: int, body: ExtractRangeRequest):
    """Cross-boundary range extraction and re-summarization."""
    if body.start_minute >= body.end_minute:
        raise HTTPException(
            status_code=422,
            detail="start_minute must be less than end_minute",
        )

    async with get_session() as session:
        repo = RecordingRepository(session)
        await repo.get_recording(recording_id)

        summaries = await repo.list_summaries_in_range(
            recording_id=recording_id,
            start_minute=body.start_minute,
            end_minute=body.end_minute,
        )

    if not summaries:
        raise HTTPException(
            status_code=404,
            detail=(f"No summaries found in range [{body.start_minute}, {body.end_minute}]"),
        )

    settings = get_settings()
    llm = create_llm(provider=settings.llm_provider)
    extractor = RangeExtractor(llm)

    summary_tuples = [(s.minute_index, s.summary_text) for s in summaries]
    return await extractor.extract_range(
        recording_id=recording_id,
        start_minute=body.start_minute,
        end_minute=body.end_minute,
        summaries=summary_tuples,
    )
