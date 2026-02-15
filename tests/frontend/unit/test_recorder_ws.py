"""
Unit tests for _stream_audio_ws() concurrent send/receive logic.
"""

import asyncio
import json
from unittest.mock import patch

import pytest

from src.ui.components.recorder import _stream_audio_ws


class FakeWebSocket:
    """Simulates a websockets connection for testing.

    Yields a "connected" message on first recv(), then streams
    any queued server messages via async iteration, and records
    all sent audio chunks.
    """

    def __init__(self, server_messages: list[dict] | None = None):
        self._server_messages = server_messages or []
        self.sent_chunks: list[bytes] = []
        self.closed = False
        self._recv_called = False

    async def recv(self):
        """Return the initial connected message."""
        self._recv_called = True
        return json.dumps({"type": "connected"})

    def __aiter__(self):
        return self._iter_messages()

    async def _iter_messages(self):
        for msg in self._server_messages:
            yield json.dumps(msg)
        # After all messages are yielded, wait until close() is called
        while not self.closed:
            await asyncio.sleep(0.01)

    async def send(self, data: bytes) -> None:
        self.sent_chunks.append(data)

    async def close(self) -> None:
        self.closed = True

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        if not self.closed:
            self.closed = True


@pytest.mark.asyncio
class TestStreamAudioWs:
    async def test_collects_transcripts(self):
        """Audio is sent and transcript messages are collected."""
        fake_ws = FakeWebSocket(
            server_messages=[
                {"type": "transcript", "data": {"text": "hello world", "minute_index": 0}},
            ]
        )

        with patch("websockets.connect", return_value=fake_ws):
            pcm = b"\x00" * 32000  # 1 second of silence
            result = await _stream_audio_ws("ws://fake/ws", pcm)

        assert len(fake_ws.sent_chunks) == 1
        assert fake_ws.sent_chunks[0] == pcm
        assert fake_ws.closed

        # Should have collected the transcript (connected message is consumed by recv)
        assert any(m["type"] == "transcript" for m in result)
        assert result[0]["data"]["text"] == "hello world"

    async def test_collects_summaries(self):
        """Both transcript and summary messages are captured."""
        fake_ws = FakeWebSocket(
            server_messages=[
                {"type": "transcript", "data": {"text": "some text"}},
                {"type": "summary", "data": {"summary_text": "a summary", "keywords": ["AI"]}},
            ]
        )

        with patch("websockets.connect", return_value=fake_ws):
            result = await _stream_audio_ws("ws://fake/ws", b"\x00" * 100)

        types = [m["type"] for m in result]
        assert "transcript" in types
        assert "summary" in types

    async def test_handles_connection_error(self):
        """ConnectionRefusedError returns an error dict."""

        class _FailConnect:
            """Async context manager that raises on __aenter__."""

            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                raise ConnectionRefusedError("refused")

            async def __aexit__(self, *args):
                pass

        with patch("websockets.connect", _FailConnect):
            result = await _stream_audio_ws("ws://fake/ws", b"\x00" * 100)

        assert len(result) == 1
        assert result[0]["type"] == "error"
        assert "refused" in result[0]["data"]["detail"]

    async def test_empty_audio(self):
        """Zero-length audio connects and closes cleanly with no sends."""
        fake_ws = FakeWebSocket(server_messages=[])

        with patch("websockets.connect", return_value=fake_ws):
            result = await _stream_audio_ws("ws://fake/ws", b"")

        assert fake_ws.sent_chunks == []
        assert fake_ws.closed
        # No error messages expected
        assert all(m.get("type") != "error" for m in result)

    async def test_multiple_chunks(self):
        """Audio longer than chunk_size is split into multiple sends."""
        fake_ws = FakeWebSocket(server_messages=[])

        with patch("websockets.connect", return_value=fake_ws):
            pcm = b"\x00" * 70000  # > 2 chunks at default 32000
            await _stream_audio_ws("ws://fake/ws", pcm, chunk_size=32000)

        assert len(fake_ws.sent_chunks) == 3  # 32000 + 32000 + 6000
        assert fake_ws.sent_chunks[0] == b"\x00" * 32000
        assert fake_ws.sent_chunks[1] == b"\x00" * 32000
        assert fake_ws.sent_chunks[2] == b"\x00" * 6000
