"""Tests for audio persistence — WAV saving, PCM buffering, and DB path update.

Ensures that PCM audio can be written to valid WAV files, that the WebSocket
pipeline state correctly accumulates raw audio bytes, and that the repository
can persist an audio file path against a recording row.
"""

import wave

import pytest

from src.services.audio.processor import AudioProcessor


@pytest.fixture
def processor():
    """Create an AudioProcessor configured for 16 kHz, 16-bit mono audio."""
    return AudioProcessor(sample_rate=16000, sample_width=2, channels=1)


class TestSaveWav:
    """Verify AudioProcessor.save_wav() writes valid WAV files from raw PCM data."""

    def test_creates_valid_wav_file(self, processor, sample_pcm_bytes, tmp_path):
        """Written WAV has correct channel count, sample width, frame rate, and frame count."""
        wav_path = tmp_path / "output.wav"
        processor.save_wav(sample_pcm_bytes, wav_path)

        with wave.open(str(wav_path), "rb") as wf:
            assert wf.getnchannels() == 1
            assert wf.getsampwidth() == 2
            assert wf.getframerate() == 16000
            expected_frames = len(sample_pcm_bytes) // 2  # 2 bytes per frame
            assert wf.getnframes() == expected_frames

    def test_creates_parent_directories(self, processor, sample_pcm_bytes, tmp_path):
        """Intermediate directories are auto-created if they don't exist."""
        wav_path = tmp_path / "nested" / "dirs" / "output.wav"
        processor.save_wav(sample_pcm_bytes, wav_path)
        assert wav_path.exists()

    def test_rejects_empty_data(self, processor, tmp_path):
        """Raises ValueError when given an empty byte string."""
        wav_path = tmp_path / "empty.wav"
        with pytest.raises(ValueError, match="empty PCM data"):
            processor.save_wav(b"", wav_path)

    def test_returns_absolute_path(self, processor, sample_pcm_bytes, tmp_path):
        """Returned path is always absolute regardless of input."""
        wav_path = tmp_path / "output.wav"
        result = processor.save_wav(sample_pcm_bytes, wav_path)
        from pathlib import Path

        assert Path(result).is_absolute()


class TestPipelineStatePcmBuffer:
    """Verify _PipelineState PCM buffer accumulates audio bytes correctly."""

    def test_accumulates_pcm_bytes(self):
        """Multiple add_audio_bytes calls append data in order."""
        from src.api.websocket import _PipelineState

        state = _PipelineState(recording_id=1)
        state.add_audio_bytes(b"\x00\x01\x02")
        state.add_audio_bytes(b"\x03\x04")
        assert len(state.pcm_buffer) == 5
        assert bytes(state.pcm_buffer) == b"\x00\x01\x02\x03\x04"

    def test_tracks_total_bytes(self):
        """total_audio_bytes reflects the cumulative byte count."""
        from src.api.websocket import _PipelineState

        state = _PipelineState(recording_id=1)
        state.add_audio_bytes(b"\x00" * 100)
        state.add_audio_bytes(b"\x00" * 200)
        assert state.total_audio_bytes == 300


@pytest.mark.asyncio
class TestUpdateAudioPath:
    """Verify repository.update_audio_path() persists the file path in SQLite."""

    async def test_sets_audio_path(self, db_session, repository):
        """Audio path is None initially, then updated and retrievable."""
        recording = await repository.create_recording(title="test")
        assert recording.audio_path is None

        updated = await repository.update_audio_path(recording.id, "/tmp/test.wav")
        assert updated.audio_path == "/tmp/test.wav"

        # Re-fetch to confirm persistence
        fetched = await repository.get_recording(recording.id)
        assert fetched.audio_path == "/tmp/test.wav"
