"""Tests for AudioProcessor (PCM conversion and silence detection).

Validates that raw PCM bytes are correctly converted to normalised float32
numpy arrays and that silence detection works for various edge cases
including empty data, quiet audio, and configurable thresholds.
"""

import numpy as np
import pytest

from src.services.audio.processor import AudioProcessor


@pytest.fixture
def processor():
    """Create an AudioProcessor configured for 16 kHz, 16-bit mono audio."""
    return AudioProcessor(sample_rate=16000, sample_width=2, channels=1)


class TestPcmToNdarray:
    """Verify PCM-to-ndarray conversion produces valid float32 samples."""

    def test_converts_pcm_to_float32(self, processor, sample_pcm_bytes):
        """Output dtype is float32 for downstream model compatibility."""
        result = processor.pcm_to_ndarray(sample_pcm_bytes)
        assert result.dtype == np.float32

    def test_output_range(self, processor, sample_pcm_bytes):
        """Normalised samples fall within [-1.0, 1.0]."""
        result = processor.pcm_to_ndarray(sample_pcm_bytes)
        assert result.max() <= 1.0
        assert result.min() >= -1.0

    def test_correct_sample_count(self, processor, sample_pcm_bytes):
        """Sample count equals duration * sample_rate."""
        result = processor.pcm_to_ndarray(sample_pcm_bytes)
        # 1 second at 16kHz = 16000 samples
        assert len(result) == 16000

    def test_rejects_misaligned_data(self, processor):
        """Raises ValueError when byte length is not a multiple of sample_width."""
        # 3 bytes is not aligned to 2-byte frame
        with pytest.raises(ValueError, match="not aligned"):
            processor.pcm_to_ndarray(b"\x00\x00\x00")

    def test_empty_data(self, processor):
        """Empty input produces a zero-length array."""
        result = processor.pcm_to_ndarray(b"")
        assert len(result) == 0


class TestIsSilent:
    """Verify silence detection logic based on RMS energy threshold."""

    def test_silence_detected(self, processor, silent_pcm_bytes):
        """Near-zero amplitude audio is classified as silent."""
        audio = processor.pcm_to_ndarray(silent_pcm_bytes)
        assert processor.is_silent(audio) is True

    def test_audio_not_silent(self, processor, sample_pcm_bytes):
        """Normal audio with audible signal is not classified as silent."""
        audio = processor.pcm_to_ndarray(sample_pcm_bytes)
        assert processor.is_silent(audio) is False

    def test_empty_array_is_silent(self, processor):
        """An empty array is treated as silence."""
        assert processor.is_silent(np.array([], dtype=np.float32)) is True

    def test_custom_threshold(self, processor, sample_pcm_bytes):
        """A very high threshold classifies any audio as silent."""
        audio = processor.pcm_to_ndarray(sample_pcm_bytes)
        # Very high threshold should classify anything as silent
        assert processor.is_silent(audio, threshold=1.0) is True
