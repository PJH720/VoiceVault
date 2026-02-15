"""
Abstract base class for Speech-to-Text providers.

All STT implementations (Whisper local, OpenAI API, etc.) must implement
this interface, enabling provider-agnostic transcription in the service layer.
"""

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator


class BaseSTT(ABC):
    """Interface that every STT provider must implement."""

    @abstractmethod
    async def transcribe(self, audio_path: str, **kwargs) -> dict:
        """Transcribe an audio file to text.

        Args:
            audio_path: Path to the audio file (WAV, 16kHz, mono).
            **kwargs: Provider-specific options (language, beam_size, etc.).

        Returns:
            Dict with keys: ``text``, ``language``, ``confidence``.
        """

    @abstractmethod
    async def transcribe_stream(
        self, audio_chunks: AsyncIterator[bytes], **kwargs
    ) -> AsyncIterator[dict]:
        """Transcribe a stream of audio chunks in real time.

        Args:
            audio_chunks: Async iterator yielding raw PCM bytes.
            **kwargs: Provider-specific options.

        Yields:
            Dicts with keys: ``text``, ``is_final``, ``confidence``.
        """
