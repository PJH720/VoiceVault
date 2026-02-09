"""
Recorder component — handles the full recording state machine.

States: idle -> processing -> completed
"""

import asyncio
import io
import logging

import numpy as np
import soundfile as sf
import streamlit as st

from src.ui.api_client import get_api_client

logger = logging.getLogger(__name__)


def _convert_to_pcm_16k_mono(audio_bytes: bytes) -> bytes:
    """Read uploaded WAV/audio bytes, resample to 16 kHz mono PCM int16."""
    data, sample_rate = sf.read(io.BytesIO(audio_bytes), dtype="float32")

    # Convert to mono if stereo
    if data.ndim > 1:
        data = data.mean(axis=1)

    # Resample to 16 kHz if needed
    if sample_rate != 16000:
        duration = len(data) / sample_rate
        num_samples = int(duration * 16000)
        indices = np.linspace(0, len(data) - 1, num_samples)
        data = np.interp(indices, np.arange(len(data)), data)

    # Convert to int16 PCM bytes
    pcm = (data * 32767).clip(-32768, 32767).astype(np.int16)
    return pcm.tobytes()


async def _stream_audio_ws(
    ws_url: str,
    pcm_bytes: bytes,
    chunk_size: int = 32000,  # 1 second of 16kHz 16-bit mono
) -> list[dict]:
    """Send PCM audio over WebSocket and collect transcript messages."""
    import websockets

    transcripts: list[dict] = []
    try:
        async with websockets.connect(ws_url) as ws:
            # Read the connected message
            await ws.recv()

            # Send audio in chunks
            offset = 0
            while offset < len(pcm_bytes):
                chunk = pcm_bytes[offset : offset + chunk_size]
                await ws.send(chunk)
                offset += chunk_size

            # Close write side to signal end of audio
            await ws.close()

    except Exception as exc:
        logger.warning("WebSocket error: %s", exc)
        transcripts.append({"type": "error", "data": {"detail": str(exc)}})

    return transcripts


def _process_audio(audio_bytes: bytes) -> None:
    """Process captured audio: create recording, send via WS, stop recording."""
    client = get_api_client()
    title = st.session_state.recording_title or None

    try:
        # 1. Create recording
        rec = client.create_recording(title=title)
        st.session_state.recording_id = rec["id"]

        # 2. Convert audio to PCM
        pcm_bytes = _convert_to_pcm_16k_mono(audio_bytes)

        # 3. Stream via WebSocket
        api_url = st.session_state.api_base_url
        ws_scheme = "ws" if api_url.startswith("http://") else "wss"
        ws_host = api_url.replace("http://", "").replace("https://", "")
        ws_url = f"{ws_scheme}://{ws_host}/ws/transcribe?recording_id={rec['id']}"

        transcripts = asyncio.run(_stream_audio_ws(ws_url, pcm_bytes))
        st.session_state.transcripts = transcripts

        # Build full transcript text from received messages
        text_parts = []
        for msg in transcripts:
            if msg.get("type") == "transcript":
                text_parts.append(msg.get("data", {}).get("text", ""))
        st.session_state.transcript_text = " ".join(text_parts)

        # 4. Stop recording
        client.stop_recording(rec["id"])
        st.session_state.recording_status = "completed"

    except Exception as exc:
        st.error(f"Processing failed: {exc}")
        st.session_state.recording_status = "idle"


def render_recorder() -> None:
    """Render the full recording UI based on current session state."""
    status = st.session_state.recording_status

    if status == "idle":
        _render_idle()
    elif status == "processing":
        _render_processing()
    elif status == "completed":
        _render_completed()


def _render_idle() -> None:
    """Show title input and audio recorder."""
    st.session_state.recording_title = st.text_input(
        "Recording title (optional)",
        value=st.session_state.recording_title,
        placeholder="e.g. AI Lecture - Week 5",
    )

    audio = st.audio_input("Record audio")

    if audio is not None:
        st.session_state.recording_status = "processing"
        st.session_state._pending_audio = audio.getvalue()
        st.rerun()


def _render_processing() -> None:
    """Process the captured audio with a spinner."""
    audio_bytes = st.session_state.pop("_pending_audio", None)
    if audio_bytes is None:
        st.session_state.recording_status = "idle"
        st.rerun()
        return

    with st.spinner("Processing audio..."):
        _process_audio(audio_bytes)

    st.rerun()


def _render_completed() -> None:
    """Show transcript and summaries for the completed recording."""
    st.success("Recording completed!")

    rec_id = st.session_state.recording_id
    st.markdown(f"**Recording ID**: {rec_id}")

    # Transcript
    transcript = st.session_state.transcript_text
    if transcript:
        st.subheader("Transcript")
        st.code(transcript, language=None)
    else:
        st.info("No transcript received (backend STT may not be configured).")

    # Summaries
    client = get_api_client()
    try:
        summaries = client.list_summaries(rec_id)
        if summaries:
            st.subheader("Summaries")
            from src.ui.components.summary_card import render_summary_list

            render_summary_list(summaries)
        else:
            st.info("No summaries generated yet.")
    except Exception:
        pass

    # Reset button
    if st.button("New Recording"):
        st.session_state.recording_id = None
        st.session_state.recording_status = "idle"
        st.session_state.recording_title = ""
        st.session_state.transcripts = []
        st.session_state.transcript_text = ""
        st.session_state.summaries = []
        st.rerun()
