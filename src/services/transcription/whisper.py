"""Whisper STT implementation using faster-whisper.

Provides both file-based and streaming transcription via the BaseSTT
interface. The WhisperModel is loaded lazily and cached at module level
to avoid repeated initialization overhead.
"""

import asyncio
import logging
import math
from collections.abc import AsyncIterator

import numpy as np
from faster_whisper import WhisperModel

from src.core.config import get_settings
from src.core.exceptions import TranscriptionError
from src.core.models import TranscriptionResult, TranscriptionSegment
from src.services.audio.processor import AudioProcessor
from src.services.audio.recorder import AudioBuffer
from src.services.transcription.base import BaseSTT

logger = logging.getLogger(__name__)

_model_cache: WhisperModel | None = None


class WhisperSTT(BaseSTT):
    """Speech-to-text provider using faster-whisper (CTranslate2).

    Args:
        model_size: Whisper model size (tiny, base, small, medium, large-v3).
        device: Computation device ("cpu" or "cuda").
        compute_type: CTranslate2 compute type ("int8", "float16", etc.).
        settings: Optional Settings instance (defaults to get_settings()).
    """

    def __init__(
        self,
        model_size: str | None = None,
        device: str = "cpu",
        compute_type: str = "int8",
        settings=None,
    ) -> None:
        self._settings = settings or get_settings()
        self._model_size = model_size or self._settings.whisper_model
        self._device = device
        self._compute_type = compute_type
        self._processor = AudioProcessor()

    def _get_model(self) -> WhisperModel:
        """Return the cached WhisperModel, loading it on first use."""
        global _model_cache  # noqa: PLW0603
        if _model_cache is None:
            logger.info(
                "Loading Whisper model: %s (device=%s, compute=%s)",
                self._model_size,
                self._device,
                self._compute_type,
            )
            _model_cache = WhisperModel(
                self._model_size,
                device=self._device,
                compute_type=self._compute_type,
            )
        return _model_cache

    def _run_transcription(
        self,
        audio,
        language: str | None = None,
        beam_size: int = 5,
        vad_filter: bool = True,
    ) -> tuple:
        """Run synchronous transcription (CPU-bound).

        Must be called via asyncio.to_thread(). The segment iterator is
        materialized into a list inside this function to avoid CTranslate2
        thread-safety issues.

        Args:
            audio: File path (str) or numpy float32 array.
            language: ISO language code or None for auto-detect.
            beam_size: Beam search width.
            vad_filter: Enable voice activity detection filtering.

        Returns:
            Tuple of (list[segment_objects], info_object).
        """
        model = self._get_model()
        segments_iter, info = model.transcribe(
            audio,
            language=language,
            beam_size=beam_size,
            vad_filter=vad_filter,
        )
        # Materialize the generator in the same thread to avoid
        # CTranslate2 cross-thread issues.
        segments = list(segments_iter)
        return segments, info

    @staticmethod
    def _logprob_to_confidence(avg_logprob: float) -> float:
        """Convert average log probability to a 0-1 confidence score."""
        return max(0.0, min(1.0, math.exp(avg_logprob)))

    @staticmethod
    def _segments_to_models(segments) -> list[TranscriptionSegment]:
        """Convert faster-whisper segment objects to Pydantic models."""
        return [
            TranscriptionSegment(
                text=seg.text.strip(),
                start=seg.start,
                end=seg.end,
                avg_logprob=seg.avg_logprob,
                no_speech_prob=seg.no_speech_prob,
            )
            for seg in segments
            if seg.text.strip()
        ]

    async def transcribe(self, audio_path: str, **kwargs) -> dict:
        """Transcribe an audio file to text.

        Args:
            audio_path: Path to WAV file (16kHz, mono).
            **kwargs: Optional keys: language, beam_size, vad_filter.

        Returns:
            Dict with text, language, confidence, duration, segments.
        """
        try:
            segments, info = await asyncio.to_thread(
                self._run_transcription,
                audio_path,
                language=kwargs.get("language"),
                beam_size=kwargs.get("beam_size", 5),
                vad_filter=kwargs.get("vad_filter", True),
            )
        except Exception as exc:
            raise TranscriptionError(detail=f"Whisper transcription failed: {exc}") from exc

        segment_models = self._segments_to_models(segments)
        full_text = " ".join(seg.text for seg in segment_models)

        avg_confidence = 0.0
        if segment_models:
            avg_logprob = sum(s.avg_logprob for s in segment_models) / len(segment_models)
            avg_confidence = self._logprob_to_confidence(avg_logprob)

        result = TranscriptionResult(
            text=full_text,
            language=info.language or "unknown",
            language_probability=info.language_probability,
            confidence=avg_confidence,
            duration=info.duration,
            segments=segment_models,
        )
        return result.model_dump()

    async def transcribe_ndarray(self, audio: np.ndarray, **kwargs) -> TranscriptionResult:
        """Transcribe a numpy audio array.

        Args:
            audio: Float32 numpy array of audio samples.
            **kwargs: Optional keys: language, beam_size, vad_filter.

        Returns:
            TranscriptionResult with text, confidence, and segments.
        """
        try:
            segments, info = await asyncio.to_thread(
                self._run_transcription,
                audio,
                language=kwargs.get("language"),
                beam_size=kwargs.get("beam_size", 5),
                vad_filter=kwargs.get("vad_filter", False),
            )
        except Exception as exc:
            raise TranscriptionError(detail=f"Whisper transcription failed: {exc}") from exc

        segment_models = self._segments_to_models(segments)
        full_text = " ".join(seg.text for seg in segment_models)

        avg_confidence = 0.0
        if segment_models:
            avg_logprob = sum(s.avg_logprob for s in segment_models) / len(segment_models)
            avg_confidence = self._logprob_to_confidence(avg_logprob)

        return TranscriptionResult(
            text=full_text,
            language=info.language or "unknown",
            language_probability=info.language_probability,
            confidence=avg_confidence,
            duration=info.duration,
            segments=segment_models,
        )

    async def transcribe_stream(
        self, audio_chunks: AsyncIterator[bytes], **kwargs
    ) -> AsyncIterator[dict]:
        """Transcribe a stream of PCM audio chunks in real time.

        Args:
            audio_chunks: Async iterator yielding raw PCM bytes
                (16-bit, 16kHz, mono).
            **kwargs: Optional keys: language, beam_size.

        Yields:
            Dicts with text, is_final, confidence, segments.
        """
        buffer = AudioBuffer(chunk_duration=3.0, overlap_duration=0.5)

        async for chunk_bytes in audio_chunks:
            buffer.add_bytes(chunk_bytes)

            while buffer.has_chunk():
                audio_array = buffer.get_chunk()
                if audio_array is None:
                    continue

                if self._processor.is_silent(audio_array):
                    continue

                result = await self.transcribe_ndarray(
                    audio_array,
                    language=kwargs.get("language"),
                    beam_size=kwargs.get("beam_size", 1),
                )

                if result.text.strip():
                    yield {
                        "text": result.text,
                        "is_final": True,
                        "confidence": result.confidence,
                        "segments": [s.model_dump() for s in result.segments],
                    }

        # Flush remaining audio
        remaining = buffer.get_remaining()
        if remaining is not None and not self._processor.is_silent(remaining):
            result = await self.transcribe_ndarray(
                remaining,
                language=kwargs.get("language"),
                beam_size=kwargs.get("beam_size", 1),
            )
            if result.text.strip():
                yield {
                    "text": result.text,
                    "is_final": True,
                    "confidence": result.confidence,
                    "segments": [s.model_dump() for s in result.segments],
                }
