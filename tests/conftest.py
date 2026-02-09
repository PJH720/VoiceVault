"""Shared pytest fixtures for VoiceVault test suite.

Provides common test fixtures used across unit and integration tests,
including mock LLM/STT providers and database setup helpers.
"""

import struct
from unittest.mock import AsyncMock

import pytest

# ---------------------------------------------------------------------------
# LLM Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_llm():
    """Create a mock LLM provider for unit testing.

    Returns:
        AsyncMock: A mock implementing the BaseLLM interface with a
        default generate response containing summary and keywords.
    """
    from src.services.llm.base import BaseLLM

    llm = AsyncMock(spec=BaseLLM)
    llm.generate.return_value = '{"summary": "test", "keywords": ["AI"]}'
    return llm


# ---------------------------------------------------------------------------
# STT Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_stt():
    """Create a mock STT provider for unit testing.

    Returns:
        AsyncMock: A mock implementing the BaseSTT interface with a
        default transcribe response.
    """
    from src.services.transcription.base import BaseSTT

    stt = AsyncMock(spec=BaseSTT)
    stt.transcribe.return_value = {
        "text": "This is a test transcription.",
        "language": "en",
        "confidence": 0.95,
    }
    return stt


# ---------------------------------------------------------------------------
# Audio Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def sample_pcm_bytes():
    """Generate 1 second of 440Hz sine-wave PCM audio (16kHz, 16-bit, mono).

    Returns:
        bytes: Raw PCM audio data.
    """
    import math

    sample_rate = 16000
    duration = 1.0
    frequency = 440.0
    amplitude = 16000  # ~50% of max int16

    samples = []
    for i in range(int(sample_rate * duration)):
        value = int(amplitude * math.sin(2 * math.pi * frequency * i / sample_rate))
        samples.append(struct.pack("<h", value))
    return b"".join(samples)


@pytest.fixture
def silent_pcm_bytes():
    """Generate 1 second of silence as PCM audio (16kHz, 16-bit, mono).

    Returns:
        bytes: Raw PCM silence data (all zeros).
    """
    sample_rate = 16000
    return b"\x00\x00" * sample_rate


@pytest.fixture
def sample_audio_path(tmp_path, sample_pcm_bytes):
    """Create a temporary WAV file from sample PCM data.

    Returns:
        str: Path to the temporary WAV file.
    """
    import wave

    wav_path = tmp_path / "test_audio.wav"
    with wave.open(str(wav_path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(sample_pcm_bytes)
    return str(wav_path)
