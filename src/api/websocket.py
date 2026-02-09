"""
WebSocket endpoint for real-time audio transcription.

The client streams raw PCM audio bytes over the WebSocket connection.
The server responds with JSON messages (transcript chunks, summaries, errors).
STT integration will be implemented in Issue #3.
"""

import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from src.core.models import WebSocketMessage, WebSocketMessageType

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

    try:
        while True:
            # Receive raw audio bytes from client
            audio_bytes = await websocket.receive_bytes()
            logger.debug(
                "Received %d bytes for recording_id=%s",
                len(audio_bytes),
                recording_id,
            )

            # TODO(Issue #3): Feed audio_bytes to STT service and stream
            # back transcript chunks. For now, acknowledge receipt.

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for recording_id=%s", recording_id)
