"""Audio buffering for streaming transcription.

Accumulates incoming PCM bytes and yields fixed-duration chunks with
overlap to prevent word-boundary cuts during streaming STT.
"""

import numpy as np

from src.services.audio.processor import AudioProcessor


class AudioBuffer:
    """Accumulates PCM audio bytes and yields chunks for transcription.

    Maintains a byte buffer and produces fixed-duration numpy arrays
    with configurable overlap between consecutive chunks.
    """

    def __init__(
        self,
        chunk_duration: float = 3.0,
        sample_rate: int = 16000,
        sample_width: int = 2,
        channels: int = 1,
        overlap_duration: float = 0.5,
    ) -> None:
        self._chunk_duration = chunk_duration
        self._sample_rate = sample_rate
        self._sample_width = sample_width
        self._channels = channels
        self._overlap_duration = overlap_duration
        self._buffer = bytearray()
        self._processor = AudioProcessor(sample_rate, sample_width, channels)

    @property
    def chunk_size_bytes(self) -> int:
        """Number of bytes required for one full chunk."""
        return int(self._chunk_duration * self._sample_rate * self._sample_width * self._channels)

    @property
    def _overlap_size_bytes(self) -> int:
        """Number of bytes for the overlap region."""
        return int(self._overlap_duration * self._sample_rate * self._sample_width * self._channels)

    @property
    def buffered_duration(self) -> float:
        """Duration of currently buffered audio in seconds."""
        return len(self._buffer) / (self._sample_rate * self._sample_width * self._channels)

    def add_bytes(self, data: bytes) -> None:
        """Append raw PCM bytes to the buffer."""
        self._buffer.extend(data)

    def has_chunk(self) -> bool:
        """Check if enough data has accumulated for a full chunk."""
        return len(self._buffer) >= self.chunk_size_bytes

    def get_chunk(self) -> np.ndarray | None:
        """Extract one chunk from the buffer, retaining overlap.

        Returns:
            Float32 numpy array of the chunk, or None if not enough data.
        """
        if not self.has_chunk():
            return None

        chunk_bytes = bytes(self._buffer[: self.chunk_size_bytes])
        # Keep overlap bytes for the next chunk
        keep_from = self.chunk_size_bytes - self._overlap_size_bytes
        self._buffer = bytearray(self._buffer[keep_from:])

        return self._processor.pcm_to_ndarray(chunk_bytes)

    def get_remaining(self) -> np.ndarray | None:
        """Flush remaining buffer content (final chunk).

        Returns None if remaining audio is less than 0.5 seconds.

        Returns:
            Float32 numpy array, or None if too short.
        """
        min_bytes = int(0.5 * self._sample_rate * self._sample_width * self._channels)
        if len(self._buffer) < min_bytes:
            return None

        # Align to frame boundary
        frame_size = self._sample_width * self._channels
        usable = len(self._buffer) - (len(self._buffer) % frame_size)
        if usable < min_bytes:
            return None

        chunk_bytes = bytes(self._buffer[:usable])
        self._buffer.clear()
        return self._processor.pcm_to_ndarray(chunk_bytes)

    def reset(self) -> None:
        """Clear the buffer."""
        self._buffer.clear()
