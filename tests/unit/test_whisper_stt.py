"""Tests for WhisperSTT (mocked WhisperModel, no GPU needed).

Validates file-based transcription, ndarray-based transcription, streaming
transcription, the logprob-to-confidence conversion, and lazy model loading
with caching — all without requiring a real Whisper model or GPU.
"""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

import src.services.transcription.whisper as whisper_module
from src.services.transcription.whisper import WhisperSTT


def _make_segment(text="Hello world", start=0.0, end=1.0, avg_logprob=-0.3, no_speech_prob=0.1):
    """Create a mock faster-whisper segment object."""
    return SimpleNamespace(
        text=text,
        start=start,
        end=end,
        avg_logprob=avg_logprob,
        no_speech_prob=no_speech_prob,
    )


def _make_info(language="en", language_probability=0.95, duration=1.0):
    """Create a mock faster-whisper transcription info object."""
    return SimpleNamespace(
        language=language,
        language_probability=language_probability,
        duration=duration,
    )


@pytest.fixture(autouse=True)
def _clear_model_cache():
    """Ensure module-level model cache is cleared before each test."""
    original = whisper_module._model_cache
    whisper_module._model_cache = None
    yield
    whisper_module._model_cache = original


@pytest.fixture
def mock_whisper_model():
    """Create a mock WhisperModel that returns one 'Hello world' segment."""
    model = MagicMock()
    segments = [_make_segment()]
    info = _make_info()
    model.transcribe.return_value = (iter(segments), info)
    return model


@pytest.fixture
def stt(mock_whisper_model):
    """Create a WhisperSTT instance with a mocked model (no real loading)."""
    with patch.object(WhisperSTT, "_get_model", return_value=mock_whisper_model):
        instance = WhisperSTT(model_size="base", device="cpu")
        # Override _get_model so it always returns the mock
        instance._get_model = MagicMock(return_value=mock_whisper_model)
        yield instance


class TestTranscribeFile:
    """Verify file-based transcription returns a well-formed result dict."""

    async def test_returns_dict_with_required_keys(self, stt):
        """Result dict contains text, language, confidence, and segments."""
        result = await stt.transcribe("/fake/audio.wav")
        assert "text" in result
        assert "language" in result
        assert "confidence" in result
        assert "segments" in result

    async def test_text_content(self, stt):
        """Transcribed text matches the mock segment."""
        result = await stt.transcribe("/fake/audio.wav")
        assert result["text"] == "Hello world"

    async def test_language_detected(self, stt):
        """Detected language matches the mock info."""
        result = await stt.transcribe("/fake/audio.wav")
        assert result["language"] == "en"

    async def test_confidence_between_0_and_1(self, stt):
        """Confidence score is normalised to [0.0, 1.0]."""
        result = await stt.transcribe("/fake/audio.wav")
        assert 0.0 <= result["confidence"] <= 1.0


class TestTranscribeNdarray:
    """Verify ndarray-based transcription returns a TranscriptionResult model."""

    async def test_returns_transcription_result(self, stt):
        """Result has text and language attributes from the mock."""
        audio = np.random.randn(16000).astype(np.float32)
        result = await stt.transcribe_ndarray(audio)
        assert result.text == "Hello world"
        assert result.language == "en"

    async def test_segments_are_models(self, stt):
        """Segments list contains parsed model objects with text."""
        audio = np.random.randn(16000).astype(np.float32)
        result = await stt.transcribe_ndarray(audio)
        assert len(result.segments) == 1
        assert result.segments[0].text == "Hello world"


class TestTranscribeStream:
    """Verify streaming transcription yields results from chunked audio."""

    async def test_yields_results(self, stt, sample_pcm_bytes):
        """Streaming 3+ seconds of audio produces at least one final result."""

        async def audio_gen():
            # Send 3+ seconds of audio so buffer produces a chunk
            for _ in range(4):
                yield sample_pcm_bytes

        results = []
        async for chunk in stt.transcribe_stream(audio_gen()):
            results.append(chunk)
        assert len(results) > 0
        assert "text" in results[0]
        assert results[0]["is_final"] is True


class TestLogprobToConfidence:
    """Verify the static logprob-to-confidence conversion function."""

    def test_zero_logprob(self):
        """Zero logprob maps to maximum confidence (1.0)."""
        assert WhisperSTT._logprob_to_confidence(0.0) == 1.0

    def test_negative_logprob(self):
        """Negative logprob produces a confidence strictly between 0 and 1."""
        conf = WhisperSTT._logprob_to_confidence(-0.5)
        assert 0.0 < conf < 1.0

    def test_very_negative_logprob(self):
        """Very negative logprob still produces a non-negative confidence."""
        conf = WhisperSTT._logprob_to_confidence(-10.0)
        assert conf >= 0.0


class TestGetModel:
    """Verify lazy model loading and module-level caching."""

    def test_lazy_loading(self):
        """Model is loaded on first _get_model() call and cached for subsequent calls."""
        with patch("src.services.transcription.whisper.WhisperModel") as MockModel:
            mock_instance = MagicMock()
            MockModel.return_value = mock_instance

            stt = WhisperSTT(model_size="tiny", device="cpu")
            model = stt._get_model()
            assert model is mock_instance
            MockModel.assert_called_once()

            # Second call should use cache
            model2 = stt._get_model()
            assert model2 is mock_instance
            MockModel.assert_called_once()
