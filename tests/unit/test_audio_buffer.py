"""Tests for AudioBuffer (chunk accumulation with overlap).

Verifies that AudioBuffer correctly accumulates raw PCM bytes, produces
fixed-duration chunks with configurable overlap, and handles edge cases
like empty buffers and partial data.
"""

import numpy as np
import pytest

from src.services.audio.recorder import AudioBuffer


@pytest.fixture
def buffer():
    """Create an AudioBuffer configured for 1-second chunks at 16 kHz mono."""
    return AudioBuffer(
        chunk_duration=1.0,
        sample_rate=16000,
        sample_width=2,
        channels=1,
        overlap_duration=0.25,
    )


class TestChunkSizeBytes:
    """Verify computed chunk size in bytes matches expected value."""

    def test_correct_size(self, buffer):
        """Chunk size should be duration * sample_rate * sample_width * channels."""
        # 1.0s * 16000 Hz * 2 bytes * 1 channel = 32000
        assert buffer.chunk_size_bytes == 32000


class TestBufferedDuration:
    """Verify buffered_duration tracks accumulated audio length in seconds."""

    def test_empty_buffer(self, buffer):
        """Fresh buffer reports zero duration."""
        assert buffer.buffered_duration == 0.0

    def test_after_adding_data(self, buffer):
        """Duration reflects the amount of audio added."""
        # Add 0.5 seconds of audio (16000 samples/s * 2 bytes * 0.5s)
        buffer.add_bytes(b"\x00" * 16000)
        assert abs(buffer.buffered_duration - 0.5) < 0.001


class TestHasChunk:
    """Verify has_chunk() correctly reports whether a full chunk is available."""

    def test_not_enough_data(self, buffer):
        """Returns False when buffered data is less than one chunk."""
        buffer.add_bytes(b"\x00" * 100)
        assert buffer.has_chunk() is False

    def test_enough_data(self, buffer, sample_pcm_bytes):
        """Returns True after adding at least one chunk's worth of audio."""
        buffer.add_bytes(sample_pcm_bytes)  # 1 second = 32000 bytes
        assert buffer.has_chunk() is True


class TestGetChunk:
    """Verify get_chunk() extracts audio data and retains overlap."""

    def test_returns_none_when_empty(self, buffer):
        """Returns None when buffer has insufficient data."""
        assert buffer.get_chunk() is None

    def test_returns_float32_array(self, buffer, sample_pcm_bytes):
        """Extracted chunk is a float32 ndarray of the correct length."""
        buffer.add_bytes(sample_pcm_bytes)
        chunk = buffer.get_chunk()
        assert chunk is not None
        assert chunk.dtype == np.float32
        assert len(chunk) == 16000  # 1 second at 16kHz

    def test_overlap_retained(self, buffer, sample_pcm_bytes):
        """After extraction, overlap_duration worth of data remains in the buffer."""
        buffer.add_bytes(sample_pcm_bytes)
        buffer.get_chunk()
        # After extracting, overlap (0.25s = 8000 bytes) should remain
        assert abs(buffer.buffered_duration - 0.25) < 0.001

    def test_multiple_chunks(self, buffer, sample_pcm_bytes):
        """Multiple chunks can be extracted from a large buffer."""
        # Add 3 seconds of audio
        buffer.add_bytes(sample_pcm_bytes * 3)
        chunks = []
        while buffer.has_chunk():
            chunk = buffer.get_chunk()
            if chunk is not None:
                chunks.append(chunk)
        assert len(chunks) >= 3


class TestGetRemaining:
    """Verify get_remaining() flushes leftover audio below one full chunk."""

    def test_returns_none_when_too_short(self, buffer):
        """Returns None when remaining audio is shorter than the minimum threshold."""
        # Less than 0.5 seconds
        buffer.add_bytes(b"\x00" * 100)
        assert buffer.get_remaining() is None

    def test_returns_remaining_audio(self, buffer, sample_pcm_bytes):
        """Returns remaining audio as a float32 ndarray."""
        buffer.add_bytes(sample_pcm_bytes)
        # Don't extract a chunk, get remaining directly
        remaining = buffer.get_remaining()
        assert remaining is not None
        assert remaining.dtype == np.float32

    def test_clears_buffer(self, buffer, sample_pcm_bytes):
        """Buffer is empty after get_remaining() drains it."""
        buffer.add_bytes(sample_pcm_bytes)
        buffer.get_remaining()
        assert buffer.buffered_duration == 0.0


class TestReset:
    """Verify reset() clears all buffered data."""

    def test_clears_buffer(self, buffer, sample_pcm_bytes):
        """After reset, buffer reports zero duration and no available chunks."""
        buffer.add_bytes(sample_pcm_bytes)
        buffer.reset()
        assert buffer.buffered_duration == 0.0
        assert buffer.has_chunk() is False
