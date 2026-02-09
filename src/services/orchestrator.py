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
from src.services.llm import create_llm
from src.services.rag import create_embedding, create_vectorstore
from src.services.storage.database import get_session
from src.services.storage.repository import RecordingRepository
from src.services.summarization.minute_summarizer import MinuteSummarizer

logger = logging.getLogger(__name__)


@dataclass
class PendingTranscript:
    """A transcript awaiting background summarization."""

    minute_index: int
    text: str


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
    ) -> None:
        self.recording_id = recording_id
        self._notify = notify
        self._interval = summarization_interval
        self._queue: asyncio.Queue[PendingTranscript] = asyncio.Queue()
        self._stop_event = asyncio.Event()
        self._task: asyncio.Task | None = None
        self._previous_summary: str | None = None

        settings = get_settings()
        llm = create_llm(provider=settings.llm_provider)
        self._summarizer = MinuteSummarizer(llm)

        # RAG embedding pipeline (failures are non-fatal)
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
        """Signal the loop to stop, wait for final drain, and finalize recording."""
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
            logger.exception(
                "Failed to finalize recording %s", self.recording_id
            )

    async def _summarization_loop(self) -> None:
        """Background loop: drain queue every interval or on stop signal."""
        logger.info(
            "Summarization loop started for recording %s", self.recording_id
        )
        try:
            while not self._stop_event.is_set():
                try:
                    await asyncio.wait_for(
                        self._stop_event.wait(), timeout=self._interval
                    )
                except TimeoutError:
                    pass  # Timer fired — drain pending transcripts
                await self._drain_and_summarize()
        except Exception:
            logger.exception(
                "Summarization loop crashed for recording %s", self.recording_id
            )
        finally:
            # Final drain to process any remaining transcripts
            await self._drain_and_summarize()
            logger.info(
                "Summarization loop ended for recording %s", self.recording_id
            )

    async def _drain_and_summarize(self) -> None:
        """Process all pending transcripts from the queue."""
        while not self._queue.empty():
            try:
                item = self._queue.get_nowait()
            except asyncio.QueueEmpty:
                break

            if not item.text or not item.text.strip():
                logger.debug(
                    "Skipping empty transcript for minute %s", item.minute_index
                )
                continue

            await self._process_one(item)

    async def _process_one(self, item: PendingTranscript) -> None:
        """Summarize a single transcript and persist + notify."""
        try:
            result = await self._summarizer.summarize_minute(
                transcript=item.text,
                minute_index=item.minute_index,
                previous_context=self._previous_summary,
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
            logger.debug(
                "Embedded summary %s into vector store", doc_id
            )
        except Exception:
            logger.warning(
                "Failed to embed summary for recording=%s minute=%s (non-fatal)",
                recording_id,
                minute_index,
            )


# ---------------------------------------------------------------------------
# Module-level singleton management
# ---------------------------------------------------------------------------

_active_session: RecordingSession | None = None


async def start_session(
    recording_id: int,
    notify: Callable[[dict], Awaitable[None]],
    summarization_interval: float = 60.0,
) -> RecordingSession:
    """Create and start a new recording session.

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
