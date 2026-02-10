"""WebSocket endpoint for real-time audio transcription.

The client streams raw PCM audio bytes over the WebSocket connection.
The server responds with JSON messages (transcript chunks, summaries, errors).

Summarization is handled asynchronously by the orchestrator — the WebSocket
handler only transcribes audio and enqueues transcripts for background
processing.

Pipeline: Audio → STT → Transcript (DB) → Orchestrator queue → (async) Summary
"""

import logging
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from src.core.config import get_settings
from src.core.models import WebSocketMessage, WebSocketMessageType
from src.services import orchestrator
from src.services.storage.database import get_session
from src.services.storage.repository import RecordingRepository
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
        self.pcm_buffer: bytearray = bytearray()

    def add_audio_bytes(self, data: bytes) -> None:
        """Append PCM data to the buffer and update the byte counter."""
        self.total_audio_bytes += len(data)
        self.pcm_buffer.extend(data)

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


async def _save_transcript(recording_id: int, minute_index: int, text: str) -> None:
    """Save a transcript row in its own transaction."""
    async with get_session() as session:
        repo = RecordingRepository(session)
        await repo.create_transcript(
            recording_id=recording_id,
            minute_index=minute_index,
            text=text,
        )


@router.websocket("/ws/transcribe")
async def transcribe_ws(
    websocket: WebSocket,
    recording_id: int = Query(...),
    language: str | None = Query(None),
) -> None:
    """Real-time audio-to-text streaming endpoint with background summarization.

    Query params:
        recording_id: ID of the recording session to attach to.
        language: ISO language code (e.g. "ko", "en") or None for auto-detect.

    Protocol:
        - Client sends: raw PCM bytes (16-bit, 16 kHz, mono).
        - Server sends: JSON ``WebSocketMessage`` objects.

    Pipeline per minute boundary:
        1. Save accumulated transcript to DB
        2. Enqueue transcript for background summarization (non-blocking)
    On disconnect:
        3. Flush partial buffer → save + enqueue
        4. Stop orchestrator session (final drain + DB update)
    """
    await websocket.accept()
    logger.info("WebSocket connected for recording_id=%s, language=%s", recording_id, language)

    # Send initial connection confirmation
    connected_msg = WebSocketMessage(
        type=WebSocketMessageType.connected,
        data={"recording_id": recording_id},
    )
    await websocket.send_json(connected_msg.model_dump(mode="json"))

    settings = get_settings()
    stt = create_stt(provider=settings.whisper_provider)
    state = _PipelineState(recording_id)

    # Resolve language: explicit param > config default > None (auto-detect)
    resolved_language = language or settings.whisper_default_language or None

    # Load user-provided context from the recording (if any)
    user_context: str | None = None
    try:
        async with get_session() as db_sess:
            repo = RecordingRepository(db_sess)
            rec = await repo.get_recording(recording_id)
            user_context = rec.context if rec else None
    except Exception:
        logger.warning("Could not load context for recording %s", recording_id)

    # --- Start orchestrator session ---
    async def _notify(data: dict) -> None:
        """Send orchestrator results back to the WebSocket client."""
        if data.get("error"):
            msg = WebSocketMessage(
                type=WebSocketMessageType.error,
                data={"detail": data.get("detail", "Summarization failed")},
            )
        else:
            msg = WebSocketMessage(
                type=WebSocketMessageType.summary,
                data=data,
            )
        await websocket.send_json(msg.model_dump(mode="json"))

    session = await orchestrator.start_session(
        recording_id=recording_id,
        notify=_notify,
        user_context=user_context,
    )

    async def audio_stream():
        """Async generator that yields PCM bytes and tracks byte count."""
        try:
            while True:
                data = await websocket.receive_bytes()
                state.add_audio_bytes(data)
                yield data
        except WebSocketDisconnect:
            return

    try:
        async for result in stt.transcribe_stream(audio_stream(), language=resolved_language):
            # Send transcript to client
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

                # Save transcript to DB (independent transaction)
                await _save_transcript(recording_id, minute_index, minute_text)

                # Enqueue for background summarization (non-blocking)
                session.enqueue_transcript(minute_index, minute_text)

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for recording_id=%s", recording_id)
    except Exception:
        logger.exception("Error during transcription for recording_id=%s", recording_id)
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
        session.enqueue_transcript(minute_index, minute_text)

    # ── Save accumulated audio as WAV ──
    if state.pcm_buffer:
        try:
            from src.services.audio.processor import AudioProcessor

            timestamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
            filename = f"recording-{recording_id}-{timestamp}.wav"
            wav_path = Path(settings.recordings_dir) / filename
            processor = AudioProcessor()
            saved_path = processor.save_wav(bytes(state.pcm_buffer), wav_path)
            async with get_session() as session:
                repo = RecordingRepository(session)
                await repo.update_audio_path(recording_id, saved_path)
            logger.info("Saved audio: recording_id=%s path=%s", recording_id, saved_path)
        except Exception:
            logger.exception("Failed to save audio for recording_id=%s", recording_id)

    # ── Stop orchestrator (drains queue + finalizes recording) ──
    await orchestrator.stop_session()
