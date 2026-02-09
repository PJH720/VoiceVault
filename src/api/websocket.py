"""WebSocket endpoint for real-time audio transcription.

The client streams raw PCM audio bytes over the WebSocket connection.
The server responds with JSON messages (transcript chunks, summaries, errors).

Pipeline: Audio → STT → Transcript (DB) → Summarizer → Summary (DB)
"""

import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from src.core.config import get_settings
from src.core.models import WebSocketMessage, WebSocketMessageType
from src.services.llm import create_llm
from src.services.storage.database import get_session
from src.services.storage.repository import RecordingRepository
from src.services.summarization.minute_summarizer import MinuteSummarizer
from src.services.transcription import create_stt

logger = logging.getLogger(__name__)

router = APIRouter()

# PCM 16-bit, 16 kHz, mono = 2 bytes/sample * 16000 samples/sec = 32000 bytes/sec
_BYTES_PER_SECOND = 32_000
_BYTES_PER_MINUTE = _BYTES_PER_SECOND * 60  # 1,920,000


class _PipelineState:
    """Tracks per-recording session state for the transcription pipeline."""

    def __init__(self, recording_id: int) -> None:
        self.recording_id = recording_id
        self.current_minute: int = 0
        self.text_buffer: str = ""
        self.total_audio_bytes: int = 0
        self.previous_summary: str | None = None

    def add_audio_bytes(self, n: int) -> None:
        """Increment the total audio byte counter."""
        self.total_audio_bytes += n

    def accumulate_text(self, text: str) -> None:
        """Append transcribed text to the current minute buffer."""
        if text:
            if self.text_buffer:
                self.text_buffer += " "
            self.text_buffer += text

    def has_crossed_minute_boundary(self) -> bool:
        """Check if enough audio bytes have arrived for a new minute."""
        return self.total_audio_bytes >= (self.current_minute + 1) * _BYTES_PER_MINUTE

    def flush_minute(self) -> tuple[int, str]:
        """Return the current minute index and buffered text, then reset."""
        minute_index = self.current_minute
        text = self.text_buffer
        self.text_buffer = ""
        self.current_minute += 1
        return minute_index, text


async def _save_transcript(
    recording_id: int, minute_index: int, text: str
) -> None:
    """Save a transcript row in its own transaction."""
    async with get_session() as session:
        repo = RecordingRepository(session)
        await repo.create_transcript(
            recording_id=recording_id,
            minute_index=minute_index,
            text=text,
        )


async def _summarize_and_save(
    summarizer: MinuteSummarizer,
    recording_id: int,
    minute_index: int,
    text: str,
    previous_context: str | None,
) -> dict | None:
    """Run summarization and persist the result. Returns summary data or None on failure."""
    try:
        result = await summarizer.summarize_minute(
            transcript=text,
            minute_index=minute_index,
            previous_context=previous_context,
        )

        settings = get_settings()
        async with get_session() as session:
            repo = RecordingRepository(session)
            await repo.create_summary(
                recording_id=recording_id,
                minute_index=minute_index,
                summary_text=result.summary_text,
                keywords=result.keywords,
                model_used=settings.llm_provider,
            )

        return {
            "minute_index": result.minute_index,
            "summary_text": result.summary_text,
            "keywords": result.keywords,
            "topic": result.topic,
        }
    except Exception:
        logger.exception(
            "Summarization failed for recording=%s minute=%s",
            recording_id,
            minute_index,
        )
        return None


@router.websocket("/ws/transcribe")
async def transcribe_ws(
    websocket: WebSocket,
    recording_id: int = Query(...),
) -> None:
    """Real-time audio-to-text streaming endpoint with DB persistence.

    Query params:
        recording_id: ID of the recording session to attach to.

    Protocol:
        - Client sends: raw PCM bytes (16-bit, 16 kHz, mono).
        - Server sends: JSON ``WebSocketMessage`` objects.

    Pipeline per minute boundary:
        1. Save accumulated transcript to DB
        2. Trigger LLM summarization
        3. Save summary to DB
        4. Send summary message to client
    """
    await websocket.accept()
    logger.info("WebSocket connected for recording_id=%s", recording_id)

    # Send initial connection confirmation
    connected_msg = WebSocketMessage(
        type=WebSocketMessageType.connected,
        data={"recording_id": recording_id},
    )
    await websocket.send_json(connected_msg.model_dump(mode="json"))

    settings = get_settings()
    stt = create_stt(provider=settings.whisper_provider)
    llm = create_llm(provider=settings.llm_provider)
    summarizer = MinuteSummarizer(llm)
    state = _PipelineState(recording_id)

    async def audio_stream():
        """Async generator that yields PCM bytes and tracks byte count."""
        try:
            while True:
                data = await websocket.receive_bytes()
                state.add_audio_bytes(len(data))
                yield data
        except WebSocketDisconnect:
            return

    try:
        async for result in stt.transcribe_stream(audio_stream()):
            # Send transcript to client (existing behavior)
            msg = WebSocketMessage(
                type=WebSocketMessageType.transcript,
                data=result,
            )
            await websocket.send_json(msg.model_dump(mode="json"))

            # Accumulate text for minute-level processing
            text = result.get("text", "") if isinstance(result, dict) else ""
            state.accumulate_text(text)

            # Check for minute boundary
            if state.has_crossed_minute_boundary() and state.text_buffer.strip():
                minute_index, minute_text = state.flush_minute()

                # Save transcript (independent transaction)
                await _save_transcript(recording_id, minute_index, minute_text)

                # Summarize and save (non-fatal on failure)
                summary_data = await _summarize_and_save(
                    summarizer,
                    recording_id,
                    minute_index,
                    minute_text,
                    state.previous_summary,
                )

                if summary_data:
                    state.previous_summary = summary_data["summary_text"]
                    summary_msg = WebSocketMessage(
                        type=WebSocketMessageType.summary,
                        data=summary_data,
                    )
                    await websocket.send_json(
                        summary_msg.model_dump(mode="json")
                    )
                else:
                    # Summarization failed — notify client but keep going
                    error_msg = WebSocketMessage(
                        type=WebSocketMessageType.error,
                        data={
                            "detail": f"Summarization failed for minute {minute_index}"
                        },
                    )
                    await websocket.send_json(
                        error_msg.model_dump(mode="json")
                    )

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for recording_id=%s", recording_id)
    except Exception:
        logger.exception(
            "Error during transcription for recording_id=%s", recording_id
        )
        try:
            error_msg = WebSocketMessage(
                type=WebSocketMessageType.error,
                data={"detail": "Transcription error occurred"},
            )
            await websocket.send_json(error_msg.model_dump(mode="json"))
        except Exception:
            pass

    # ── Flush remaining buffer on disconnect ──
    if state.text_buffer.strip():
        minute_index, minute_text = state.flush_minute()
        logger.info(
            "Flushing partial minute %s for recording_id=%s",
            minute_index,
            recording_id,
        )

        await _save_transcript(recording_id, minute_index, minute_text)

        await _summarize_and_save(
            summarizer,
            recording_id,
            minute_index,
            minute_text,
            state.previous_summary,
        )
