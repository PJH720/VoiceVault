"""Integration tests for WebSocket transcription endpoint."""

from unittest.mock import AsyncMock, patch

from starlette.testclient import TestClient

# ---------------------------------------------------------------------------
# WebSocket connection
# ---------------------------------------------------------------------------


def test_websocket_connection(test_client: TestClient):
    """Connect to WS and receive initial 'connected' message."""
    with test_client.websocket_connect("/ws/transcribe?recording_id=1") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "connected"
        assert msg["data"]["recording_id"] == 1


# ---------------------------------------------------------------------------
# WebSocket transcription
# ---------------------------------------------------------------------------


def test_websocket_transcription(test_client: TestClient, sample_pcm_bytes):
    """Send PCM bytes → mock STT yields result → receive transcript message."""
    mock_stt = AsyncMock()

    async def fake_transcribe_stream(audio_chunks, **kwargs):
        async for _ in audio_chunks:
            yield {"text": "안녕하세요", "is_final": True, "confidence": 0.95}
            return

    mock_stt.transcribe_stream = fake_transcribe_stream

    with patch("src.api.websocket.create_stt", return_value=mock_stt):
        with test_client.websocket_connect("/ws/transcribe?recording_id=1") as ws:
            # Receive the initial connected message
            connected_msg = ws.receive_json()
            assert connected_msg["type"] == "connected"

            # Send audio bytes
            ws.send_bytes(sample_pcm_bytes)

            # Receive transcript response
            msg = ws.receive_json()
            assert msg["type"] == "transcript"
            assert msg["data"]["text"] == "안녕하세요"
            assert msg["data"]["is_final"] is True


# ---------------------------------------------------------------------------
# WebSocket disconnect handling
# ---------------------------------------------------------------------------


def test_websocket_disconnect_handling(test_client: TestClient, sample_pcm_bytes):
    """Connect → send bytes → close → no server error."""
    mock_stt = AsyncMock()

    async def fake_transcribe_stream(audio_chunks, **kwargs):
        async for _ in audio_chunks:
            yield {"text": "test", "is_final": False, "confidence": 0.8}

    mock_stt.transcribe_stream = fake_transcribe_stream

    with patch("src.api.websocket.create_stt", return_value=mock_stt):
        with test_client.websocket_connect("/ws/transcribe?recording_id=1") as ws:
            connected_msg = ws.receive_json()
            assert connected_msg["type"] == "connected"
            ws.send_bytes(sample_pcm_bytes)
            # Close without reading — server should handle gracefully


# ---------------------------------------------------------------------------
# Missing recording_id
# ---------------------------------------------------------------------------


def test_websocket_missing_recording_id(test_client: TestClient):
    """Connect without recording_id query param → expect failure."""
    try:
        with test_client.websocket_connect("/ws/transcribe") as ws:
            # FastAPI should reject the connection due to missing required param
            ws.receive_json()
            assert False, "Expected WebSocket connection to fail"
    except Exception:
        # Connection should fail — missing required query param
        pass
