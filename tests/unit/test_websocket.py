"""Tests for the WebSocket transcription endpoint."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from starlette.testclient import TestClient

from src.api.app import create_app


def _make_mock_stt():
    """Create a mock STT whose transcribe_stream is an empty async generator."""
    stt = AsyncMock()

    async def empty_stream(audio_chunks, **kwargs):
        return
        yield  # noqa: RET504 — makes this an async generator

    stt.transcribe_stream = empty_stream
    return stt


def _make_mock_session():
    """Create a mock RecordingSession returned by the orchestrator."""
    session = MagicMock()
    session.recording_id = 1
    session.enqueue_transcript = MagicMock()
    return session


@pytest.fixture
def app():
    return create_app()


# ---------------------------------------------------------------------------
# WebSocket tests (use Starlette sync TestClient for WebSocket support)
# ---------------------------------------------------------------------------


@patch("src.api.websocket.orchestrator.stop_session", new_callable=AsyncMock)
@patch(
    "src.api.websocket.orchestrator.start_session",
    new_callable=AsyncMock,
    return_value=_make_mock_session(),
)
@patch("src.api.websocket.create_stt", return_value=_make_mock_stt())
def test_websocket_connects_and_sends_connected_message(
    _mock_stt, _mock_start, _mock_stop, app
):
    client = TestClient(app)
    with client.websocket_connect("/ws/transcribe?recording_id=1") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "connected"
        assert msg["data"]["recording_id"] == 1


@patch("src.api.websocket.orchestrator.stop_session", new_callable=AsyncMock)
@patch(
    "src.api.websocket.orchestrator.start_session",
    new_callable=AsyncMock,
    return_value=_make_mock_session(),
)
@patch("src.api.websocket.create_stt", return_value=_make_mock_stt())
def test_websocket_receives_audio_bytes(_mock_stt, _mock_start, _mock_stop, app):
    client = TestClient(app)
    with client.websocket_connect("/ws/transcribe?recording_id=42") as ws:
        # Consume the initial connected message
        ws.receive_json()
        # Send dummy audio bytes — server should accept without error
        ws.send_bytes(b"\x00" * 1024)


@patch("src.api.websocket.orchestrator.stop_session", new_callable=AsyncMock)
@patch(
    "src.api.websocket.orchestrator.start_session",
    new_callable=AsyncMock,
    return_value=_make_mock_session(),
)
@patch("src.api.websocket.create_stt", return_value=_make_mock_stt())
def test_websocket_requires_recording_id(_mock_stt, _mock_start, _mock_stop, app):
    """Connecting without recording_id query param should fail."""
    client = TestClient(app)
    with pytest.raises(Exception):  # noqa: B017
        with client.websocket_connect("/ws/transcribe") as ws:
            ws.receive_json()
