"""Background task orchestrator for periodic summarization.

Decouples summarization from the WebSocket receive loop by running
it as an independent ``asyncio.Task``. A singleton ``RecordingSession``
ensures only one recording is active at a time.

Usage::

    from src.services.orchestrator import start_session, stop_session, cleanup

    session = await start_session(recording_id, notify_callback)
    session.enqueue_transcript(minute_index=0, text="...")
    await stop_session()
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime

from src.core.config import get_settings
from src.core.exceptions import RecordingAlreadyActiveError
from src.services.classification import create_classifier
from src.services.classification.template_matcher import TemplateMatcher
from src.services.llm import create_llm
from src.services.rag import create_embedding, create_vectorstore
from src.services.storage.database import get_session
from src.services.storage.repository import RecordingRepository
from src.services.summarization.minute_summarizer import MinuteSummarizer
from src.services.summarization.hour_summarizer import HourSummarizer

logger = logging.getLogger(__name__)


@dataclass
class PendingTranscript:
    """A transcript awaiting background summarization."""

    minute_index: int
    text: str


def _group_summaries_by_hour(summaries: list) -> dict[int, list[str]]:
    """Group minute summaries by hour boundaries.
    
    Args:
        summaries: List of Summary objects with minute_index and summary_text
        
    Returns:
        Dict mapping hour_index (0, 1, 2...) to list of summary texts for that hour
    """
    hour_groups: dict[int, list[str]] = {}
    
    for summary in summaries:
        if not summary.summary_text or not summary.summary_text.strip():
            continue
            
        hour_index = summary.minute_index // 60
        if hour_index not in hour_groups:
            hour_groups[hour_index] = []
        hour_groups[hour_index].append(summary.summary_text)
    
    return hour_groups


class RecordingSession:
    """Manages one recording's background summarization pipeline.

    Args:
        recording_id: The recording to summarize for.
        notify: Async callback to send results back (e.g. WebSocket send).
        summarization_interval: Seconds between drain cycles (default 60.0).
    """

    def __init__(
        self,
        recording_id: int,
        notify: Callable[[dict], Awaitable[None]],
        summarization_interval: float = 60.0,
        user_context: str | None = None,
    ) -> None:
        """Initialize the recording session.

        Args:
            recording_id: ID of the recording to summarize.
            notify: Async callback invoked with summary results or errors,
                typically sends data back over the WebSocket.
            summarization_interval: Seconds between queue drain cycles.
            user_context: Optional user-provided context for STT error correction.
        """
        self.recording_id = recording_id
        self._notify = notify
        self._interval = summarization_interval
        self._user_context = user_context
        self._queue: asyncio.Queue[PendingTranscript] = asyncio.Queue()
        self._stop_event = asyncio.Event()
        self._task: asyncio.Task | None = None
        # Track the previous minute's summary for continuity across segments
        self._previous_summary: str | None = None

        settings = get_settings()
        llm = create_llm(provider=settings.llm_provider)
        self._summarizer = MinuteSummarizer(llm)

        # RAG embedding pipeline (failures are non-fatal — summarization continues)
        try:
            self._embedding = create_embedding(provider=settings.embedding_provider)
            self._vectorstore = create_vectorstore()
        except Exception:
            logger.warning("Failed to initialize RAG pipeline; embedding will be skipped")
            self._embedding = None
            self._vectorstore = None

    def start(self) -> None:
        """Launch the background summarization loop."""
        self._task = asyncio.create_task(self._summarization_loop())

    def enqueue_transcript(self, minute_index: int, text: str) -> None:
        """Add a transcript to the processing queue (non-blocking)."""
        self._queue.put_nowait(PendingTranscript(minute_index=minute_index, text=text))

    async def stop(self) -> None:
        """Signal the loop to stop, wait for final drain, and finalize recording.

        Sequence: set stop event -> await background task completion
        -> mark recording as completed in DB -> auto-classify recording.
        """
        self._stop_event.set()
        if self._task is not None:
            await self._task
            self._task = None

        # Mark recording as completed in DB
        try:
            async with get_session() as session:
                repo = RecordingRepository(session)
                await repo.stop_recording(self.recording_id)
            logger.info("Recording %s finalized as completed", self.recording_id)
        except Exception:
            logger.exception("Failed to finalize recording %s", self.recording_id)

        # Generate hour summaries (non-fatal)
        await self._generate_hour_summaries()

        # Auto-classify recording (non-fatal)
        await self._classify_recording()

    async def _summarization_loop(self) -> None:
        """Background loop: drain queue every ``_interval`` seconds or on stop.

        Uses ``asyncio.wait_for`` on the stop event as a cancellable timer.
        On each cycle (timer or stop signal), all pending transcripts are
        drained and summarized. A final drain runs in the ``finally`` block.
        """
        logger.info("Summarization loop started for recording %s", self.recording_id)
        try:
            while not self._stop_event.is_set():
                try:
                    await asyncio.wait_for(self._stop_event.wait(), timeout=self._interval)
                except TimeoutError:
                    pass  # Timer fired — drain pending transcripts
                await self._drain_and_summarize()
        except Exception:
            logger.exception("Summarization loop crashed for recording %s", self.recording_id)
        finally:
            # Final drain to process any remaining transcripts
            await self._drain_and_summarize()
            logger.info("Summarization loop ended for recording %s", self.recording_id)

    async def _drain_and_summarize(self) -> None:
        """Process all pending transcripts from the queue."""
        while not self._queue.empty():
            try:
                item = self._queue.get_nowait()
            except asyncio.QueueEmpty:
                break

            if not item.text or not item.text.strip():
                logger.debug("Skipping empty transcript for minute %s", item.minute_index)
                continue

            await self._process_one(item)

    async def _process_one(self, item: PendingTranscript) -> None:
        """Summarize a single transcript, persist to DB, embed in ChromaDB, and notify.

        The full pipeline for one minute: LLM summarize -> save to DB
        -> embed into vector store -> send result via notify callback.
        All steps except summarization are non-fatal.
        """
        try:
            result = await self._summarizer.summarize_minute(
                transcript=item.text,
                minute_index=item.minute_index,
                previous_context=self._previous_summary,
                user_context=self._user_context,
            )

            settings = get_settings()
            async with get_session() as session:
                repo = RecordingRepository(session)
                await repo.create_summary(
                    recording_id=self.recording_id,
                    minute_index=item.minute_index,
                    summary_text=result.summary_text,
                    keywords=result.keywords,
                    model_used=settings.llm_provider,
                    corrections=[c.model_dump() for c in result.corrections],
                )

            self._previous_summary = result.summary_text

            # Embed summary into ChromaDB (non-blocking, non-fatal)
            await self._embed_summary(
                recording_id=self.recording_id,
                minute_index=item.minute_index,
                summary_text=result.summary_text,
                keywords=result.keywords,
            )

            summary_data = {
                "minute_index": result.minute_index,
                "summary_text": result.summary_text,
                "keywords": result.keywords,
                "topic": result.topic,
                "corrections": [c.model_dump() for c in result.corrections],
            }

            try:
                await self._notify(summary_data)
            except Exception:
                logger.warning(
                    "Notify callback failed for minute %s (non-fatal)",
                    item.minute_index,
                )

        except Exception:
            logger.exception(
                "Summarization failed for recording=%s minute=%s",
                self.recording_id,
                item.minute_index,
            )
            try:
                await self._notify(
                    {
                        "error": True,
                        "detail": f"Summarization failed for minute {item.minute_index}",
                    }
                )
            except Exception:
                pass

    async def _embed_summary(
        self,
        recording_id: int,
        minute_index: int,
        summary_text: str,
        keywords: list[str],
    ) -> None:
        """Embed a summary into the vector store. Failures are logged but never block."""
        if self._embedding is None or self._vectorstore is None:
            return

        try:
            vector = await self._embedding.embed(summary_text)
            doc_id = f"summary-{recording_id}-{minute_index}"
            metadata = {
                "recording_id": recording_id,
                "minute_index": minute_index,
                "date": datetime.now(UTC).isoformat(),
                "keywords": ",".join(keywords) if keywords else "",
            }
            await self._vectorstore.add(
                doc_id=doc_id,
                text=summary_text,
                embedding=vector,
                metadata=metadata,
            )
            logger.debug("Embedded summary %s into vector store", doc_id)
        except Exception:
            logger.warning(
                "Failed to embed summary for recording=%s minute=%s (non-fatal)",
                recording_id,
                minute_index,
            )

    async def _generate_hour_summaries(self) -> None:
        """Generate hour-level summaries after recording stops. Failures are logged but never block.
        
        Groups all minute summaries by hour boundaries (0-59 min = hour 0, 60-119 min = hour 1, etc.)
        and generates hierarchical hour summaries for each complete hour using HourSummarizer.
        """
        try:
            async with get_session() as session:
                repo = RecordingRepository(session)
                summaries = await repo.list_summaries(self.recording_id)

                if not summaries:
                    logger.info(
                        "No summaries for recording %s; skipping hour summary generation",
                        self.recording_id,
                    )
                    return

                # Group summaries by hour boundaries
                hour_groups = _group_summaries_by_hour(summaries)
                
                if not hour_groups:
                    logger.info(
                        "No valid summaries for recording %s; skipping hour summary generation",
                        self.recording_id,
                    )
                    return

                # Initialize hour summarizer with same LLM as minute summarizer
                settings = get_settings()
                llm = create_llm(provider=settings.llm_provider)
                hour_summarizer = HourSummarizer(llm)

                # Generate hour summaries for each complete hour
                for hour_index, minute_summaries in hour_groups.items():
                    # Only generate hour summary if we have enough summaries (at least 10 minutes)
                    if len(minute_summaries) < 10:
                        logger.info(
                            "Skipping hour %d for recording %s (only %d minutes, need at least 10)",
                            hour_index,
                            self.recording_id,
                            len(minute_summaries),
                        )
                        continue

                    try:
                        hour_result = await hour_summarizer.summarize_hour(
                            recording_id=self.recording_id,
                            hour_index=hour_index,
                            minute_summaries=minute_summaries,
                        )

                        # Save hour summary to database
                        await repo.create_hour_summary(
                            recording_id=self.recording_id,
                            hour_index=hour_result.hour_index,
                            summary_text=hour_result.summary_text,
                            keywords=hour_result.keywords,
                            topic_segments=hour_result.topic_segments,
                            token_count=hour_result.token_count,
                            model_used=hour_result.model_used,
                        )

                        logger.info(
                            "Generated hour summary %d for recording %s (token_count=%d)",
                            hour_index,
                            self.recording_id,
                            hour_result.token_count,
                        )

                    except Exception:
                        logger.warning(
                            "Failed to generate hour summary %d for recording %s (non-fatal)",
                            hour_index,
                            self.recording_id,
                            exc_info=True,
                        )

        except Exception:
            logger.warning(
                "Hour summary generation failed for recording %s (non-fatal)",
                self.recording_id,
                exc_info=True,
            )

    async def _classify_recording(self) -> None:
        """Classify the recording after stop. Failures are logged but never block.

        Combines all minute summaries into one text, runs zero-shot classification,
        matches to the best template, and persists the classification result.
        """
        try:
            async with get_session() as session:
                repo = RecordingRepository(session)
                summaries = await repo.list_summaries(self.recording_id)

                if not summaries:
                    logger.info(
                        "No summaries for recording %s; skipping classification",
                        self.recording_id,
                    )
                    return

                combined_text = "\n".join(s.summary_text for s in summaries if s.summary_text)
                if not combined_text.strip():
                    return

                settings = get_settings()
                llm = create_llm(provider=settings.llm_provider)
                classifier = create_classifier(llm)
                result = await classifier.classify(combined_text)

                matcher = TemplateMatcher(session)
                template = await matcher.match(result)

                total_minutes = len(summaries)
                await repo.create_classification(
                    recording_id=self.recording_id,
                    template_name=template.name,
                    template_id=template.id,
                    start_minute=0,
                    end_minute=max(total_minutes - 1, 0),
                    confidence=result.confidence,
                    result_json={
                        "category": result.category,
                        "confidence": result.confidence,
                        "reason": result.reason,
                        "template_display_name": template.display_name,
                        "template_icon": template.icon,
                    },
                )
                logger.info(
                    "Recording %s classified as %r (confidence=%.2f, template=%s)",
                    self.recording_id,
                    result.category,
                    result.confidence,
                    template.name,
                )
        except Exception:
            logger.warning(
                "Classification failed for recording %s (non-fatal)",
                self.recording_id,
                exc_info=True,
            )


# ---------------------------------------------------------------------------
# Module-level singleton management
# ---------------------------------------------------------------------------

_active_session: RecordingSession | None = None


async def start_session(
    recording_id: int,
    notify: Callable[[dict], Awaitable[None]],
    summarization_interval: float = 60.0,
    user_context: str | None = None,
) -> RecordingSession:
    """Create and start a new recording session (singleton).

    Only one session can be active at a time. The background summarization
    loop begins immediately after creation.

    Args:
        recording_id: The recording to manage.
        notify: Async callback for sending results back to the client.
        summarization_interval: Seconds between queue drain cycles.
        user_context: Optional context for STT error correction.

    Returns:
        The newly created and started ``RecordingSession``.

    Raises:
        RecordingAlreadyActiveError: If a session is already running.
    """
    global _active_session
    if _active_session is not None:
        raise RecordingAlreadyActiveError()

    session = RecordingSession(
        recording_id=recording_id,
        notify=notify,
        summarization_interval=summarization_interval,
        user_context=user_context,
    )
    session.start()
    _active_session = session
    logger.info("Started orchestrator session for recording %s", recording_id)
    return session


async def stop_session() -> None:
    """Stop the active session, drain remaining transcripts, and finalize."""
    global _active_session
    if _active_session is None:
        return
    session = _active_session
    _active_session = None
    await session.stop()
    logger.info("Stopped orchestrator session for recording %s", session.recording_id)


def get_active_session() -> RecordingSession | None:
    """Return the currently active session, or None."""
    return _active_session


async def cleanup() -> None:
    """Force-stop the active session (called during app shutdown)."""
    await stop_session()
