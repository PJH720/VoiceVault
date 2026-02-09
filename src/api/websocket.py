"""WebSocket endpoint for real-time audio transcription.

The client streams raw PCM audio bytes over the WebSocket connection.
The server responds with JSON messages (transcript chunks, summaries, errors).
"""

import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from src.core.config import get_settings
from src.core.models import WebSocketMessage, WebSocketMessageType
from src.services.transcription import create_stt

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/transcribe")
async def transcribe_ws(
    websocket: WebSocket,
    recording_id: int = Query(...),
) -> None:
    """Real-time audio-to-text streaming endpoint.

    Query params:
        recording_id: ID of the recording session to attach to.

    Protocol:
        - Client sends: raw PCM bytes (16-bit, 16 kHz, mono).
        - Server sends: JSON ``WebSocketMessage`` objects.
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

    async def audio_stream():
        """Async generator that yields PCM bytes from the WebSocket."""
        try:
            while True:
                yield await websocket.receive_bytes()
        except WebSocketDisconnect:
            return

    try:
        async for result in stt.transcribe_stream(audio_stream()):
            msg = WebSocketMessage(
                type=WebSocketMessageType.transcript,
                data=result,
            )
            await websocket.send_json(msg.model_dump(mode="json"))
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
