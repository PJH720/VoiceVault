"""Tests for audio persistence — WAV saving, PCM buffering, and DB path update."""

import wave

import pytest

from src.services.audio.processor import AudioProcessor


@pytest.fixture
def processor():
    return AudioProcessor(sample_rate=16000, sample_width=2, channels=1)


class TestSaveWav:
    def test_creates_valid_wav_file(self, processor, sample_pcm_bytes, tmp_path):
        wav_path = tmp_path / "output.wav"
        processor.save_wav(sample_pcm_bytes, wav_path)

        with wave.open(str(wav_path), "rb") as wf:
            assert wf.getnchannels() == 1
            assert wf.getsampwidth() == 2
            assert wf.getframerate() == 16000
            expected_frames = len(sample_pcm_bytes) // 2  # 2 bytes per frame
            assert wf.getnframes() == expected_frames

    def test_creates_parent_directories(self, processor, sample_pcm_bytes, tmp_path):
        wav_path = tmp_path / "nested" / "dirs" / "output.wav"
        processor.save_wav(sample_pcm_bytes, wav_path)
        assert wav_path.exists()

    def test_rejects_empty_data(self, processor, tmp_path):
        wav_path = tmp_path / "empty.wav"
        with pytest.raises(ValueError, match="empty PCM data"):
            processor.save_wav(b"", wav_path)

    def test_returns_absolute_path(self, processor, sample_pcm_bytes, tmp_path):
        wav_path = tmp_path / "output.wav"
        result = processor.save_wav(sample_pcm_bytes, wav_path)
        from pathlib import Path

        assert Path(result).is_absolute()


class TestPipelineStatePcmBuffer:
    def test_accumulates_pcm_bytes(self):
        from src.api.websocket import _PipelineState

        state = _PipelineState(recording_id=1)
        state.add_audio_bytes(b"\x00\x01\x02")
        state.add_audio_bytes(b"\x03\x04")
        assert len(state.pcm_buffer) == 5
        assert bytes(state.pcm_buffer) == b"\x00\x01\x02\x03\x04"

    def test_tracks_total_bytes(self):
        from src.api.websocket import _PipelineState

        state = _PipelineState(recording_id=1)
        state.add_audio_bytes(b"\x00" * 100)
        state.add_audio_bytes(b"\x00" * 200)
        assert state.total_audio_bytes == 300


@pytest.mark.asyncio
class TestUpdateAudioPath:
    async def test_sets_audio_path(self, db_session, repository):
        recording = await repository.create_recording(title="test")
        assert recording.audio_path is None

        updated = await repository.update_audio_path(recording.id, "/tmp/test.wav")
        assert updated.audio_path == "/tmp/test.wav"

        fetched = await repository.get_recording(recording.id)
        assert fetched.audio_path == "/tmp/test.wav"
