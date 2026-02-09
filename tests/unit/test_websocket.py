"""Tests for the WebSocket transcription endpoint."""

import pytest
from starlette.testclient import TestClient

from src.api.app import create_app


@pytest.fixture
def app():
    return create_app()


# ---------------------------------------------------------------------------
# WebSocket tests (use Starlette sync TestClient for WebSocket support)
# ---------------------------------------------------------------------------


def test_websocket_connects_and_sends_connected_message(app):
    client = TestClient(app)
    with client.websocket_connect("/ws/transcribe?recording_id=1") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "connected"
        assert msg["data"]["recording_id"] == 1


def test_websocket_receives_audio_bytes(app):
    client = TestClient(app)
    with client.websocket_connect("/ws/transcribe?recording_id=42") as ws:
        # Consume the initial connected message
        ws.receive_json()
        # Send dummy audio bytes — server should accept without error
        ws.send_bytes(b"\x00" * 1024)


def test_websocket_requires_recording_id(app):
    """Connecting without recording_id query param should fail."""
    client = TestClient(app)
    with pytest.raises(Exception):  # noqa: B017
        with client.websocket_connect("/ws/transcribe") as ws:
            ws.receive_json()
