"""Shared pytest fixtures for VoiceVault test suite.

Provides common test fixtures used across unit and integration tests,
including mock LLM/STT providers and database setup helpers.
"""

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
