"""Audio processing utilities for PCM data.

Converts raw PCM bytes to numpy arrays and provides silence detection.
"""

import wave
from pathlib import Path

import numpy as np


class AudioProcessor:
    """Handles PCM audio data conversion and analysis.

    Provides utilities for converting raw PCM bytes to numpy arrays,
    saving to WAV files, and detecting silence via RMS energy.
    """

    def __init__(
        self,
        sample_rate: int = 16000,
        sample_width: int = 2,
        channels: int = 1,
    ) -> None:
        """Initialize the audio processor.

        Args:
            sample_rate: Audio sample rate in Hz (default: 16 kHz).
            sample_width: Bytes per sample (2 = 16-bit signed PCM).
            channels: Number of audio channels (1 = mono).
        """
        self.sample_rate = sample_rate
        self.sample_width = sample_width
        self.channels = channels

    def pcm_to_ndarray(self, pcm_data: bytes) -> np.ndarray:
        """Convert raw PCM bytes (16-bit signed) to float32 numpy array.

        Args:
            pcm_data: Raw PCM bytes (16-bit, mono).

        Returns:
            Float32 numpy array normalized to [-1.0, 1.0].

        Raises:
            ValueError: If data length is not aligned to sample frame size.
        """
        frame_size = self.sample_width * self.channels
        if len(pcm_data) % frame_size != 0:
            raise ValueError(
                f"PCM data length ({len(pcm_data)}) is not aligned to frame size ({frame_size})"
            )
        # Convert 16-bit signed integers to float32 in [-1.0, 1.0] range
        return np.frombuffer(pcm_data, dtype=np.int16).astype(np.float32) / 32768.0

    def save_wav(self, pcm_data: bytes, file_path: str | Path) -> str:
        """Write raw PCM bytes to a WAV file.

        Args:
            pcm_data: Raw PCM bytes (16-bit, mono).
            file_path: Destination path for the WAV file.

        Returns:
            The absolute path to the saved file.

        Raises:
            ValueError: If pcm_data is empty.
        """
        if not pcm_data:
            raise ValueError("Cannot save empty PCM data to WAV")
        path = Path(file_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(path), "wb") as wf:
            wf.setnchannels(self.channels)
            wf.setsampwidth(self.sample_width)
            wf.setframerate(self.sample_rate)
            wf.writeframes(pcm_data)
        return str(path.resolve())

    def is_silent(self, audio: np.ndarray, threshold: float = 0.01) -> bool:
        """Check if an audio segment is silence based on RMS energy.

        Args:
            audio: Float32 numpy array of audio samples.
            threshold: RMS energy below this value is considered silence.

        Returns:
            True if the audio is silence.
        """
        if len(audio) == 0:
            return True
        # RMS (Root Mean Square) measures signal energy — low RMS = silence
        rms = np.sqrt(np.mean(audio**2))
        return float(rms) < threshold
