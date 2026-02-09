"""Tests for AudioProcessor (PCM conversion and silence detection)."""

import numpy as np
import pytest

from src.services.audio.processor import AudioProcessor


@pytest.fixture
def processor():
    return AudioProcessor(sample_rate=16000, sample_width=2, channels=1)


class TestPcmToNdarray:
    def test_converts_pcm_to_float32(self, processor, sample_pcm_bytes):
        result = processor.pcm_to_ndarray(sample_pcm_bytes)
        assert result.dtype == np.float32

    def test_output_range(self, processor, sample_pcm_bytes):
        result = processor.pcm_to_ndarray(sample_pcm_bytes)
        assert result.max() <= 1.0
        assert result.min() >= -1.0

    def test_correct_sample_count(self, processor, sample_pcm_bytes):
        result = processor.pcm_to_ndarray(sample_pcm_bytes)
        # 1 second at 16kHz = 16000 samples
        assert len(result) == 16000

    def test_rejects_misaligned_data(self, processor):
        # 3 bytes is not aligned to 2-byte frame
        with pytest.raises(ValueError, match="not aligned"):
            processor.pcm_to_ndarray(b"\x00\x00\x00")

    def test_empty_data(self, processor):
        result = processor.pcm_to_ndarray(b"")
        assert len(result) == 0


class TestIsSilent:
    def test_silence_detected(self, processor, silent_pcm_bytes):
        audio = processor.pcm_to_ndarray(silent_pcm_bytes)
        assert processor.is_silent(audio) is True

    def test_audio_not_silent(self, processor, sample_pcm_bytes):
        audio = processor.pcm_to_ndarray(sample_pcm_bytes)
        assert processor.is_silent(audio) is False

    def test_empty_array_is_silent(self, processor):
        assert processor.is_silent(np.array([], dtype=np.float32)) is True

    def test_custom_threshold(self, processor, sample_pcm_bytes):
        audio = processor.pcm_to_ndarray(sample_pcm_bytes)
        # Very high threshold should classify anything as silent
        assert processor.is_silent(audio, threshold=1.0) is True
