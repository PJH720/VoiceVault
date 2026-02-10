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

from src.core.config import get_settings
from src.ui.api_client import get_api_client
from src.ui.utils import open_folder_in_explorer

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
    """Send PCM audio over WebSocket and collect transcript messages.

    Runs a sender (audio upload) and receiver (message collection)
    concurrently so that transcripts/summaries arriving mid-stream
    are captured instead of being lost.
    """
    import json

    import websockets
    from websockets.exceptions import ConnectionClosedOK

    transcripts: list[dict] = []

    async def _receiver(ws) -> None:  # noqa: ANN001
        """Collect all JSON messages until the connection closes."""
        try:
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                except (json.JSONDecodeError, TypeError):
                    continue
                transcripts.append(msg)
        except ConnectionClosedOK:
            pass

    try:
        async with websockets.connect(ws_url) as ws:
            # Consume the initial "connected" message
            await ws.recv()

            # Start background receiver
            recv_task = asyncio.create_task(_receiver(ws))

            # Send audio in chunks
            offset = 0
            while offset < len(pcm_bytes):
                chunk = pcm_bytes[offset : offset + chunk_size]
                await ws.send(chunk)
                offset += chunk_size

            # Grace period for the server to flush its last STT result
            await asyncio.sleep(0.5)

            # Close the connection — receiver will exit via ConnectionClosedOK
            await ws.close()

            # Wait for receiver to finish (safety net)
            try:
                await asyncio.wait_for(recv_task, timeout=3.0)
            except TimeoutError:
                recv_task.cancel()

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

        lang = st.session_state.transcription_language
        if lang:
            ws_url += f"&language={lang}"

        transcripts = asyncio.run(_stream_audio_ws(ws_url, pcm_bytes))
        st.session_state.transcripts = transcripts

        # Build full transcript text and collect summaries from received messages
        text_parts = []
        summary_list = []
        for msg in transcripts:
            msg_type = msg.get("type")
            data = msg.get("data", {})
            if msg_type == "transcript":
                text_parts.append(data.get("text", ""))
                # Track detected language from the last transcript chunk
                if data.get("language"):
                    st.session_state.detected_language = data["language"]
                if data.get("language_probability"):
                    st.session_state.detected_language_prob = data["language_probability"]
            elif msg_type == "summary":
                summary_list.append(data)
        st.session_state.transcript_text = " ".join(text_parts)
        st.session_state.summaries = summary_list

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


_LANGUAGE_OPTIONS = [
    ("Auto-detect", None),
    ("\ud55c\uad6d\uc5b4 (ko)", "ko"),
    ("English (en)", "en"),
    ("\u65e5\u672c\u8a9e (ja)", "ja"),
    ("\u4e2d\u6587 (zh)", "zh"),
    ("Espa\u00f1ol (es)", "es"),
    ("Fran\u00e7ais (fr)", "fr"),
    ("Deutsch (de)", "de"),
]


def _render_idle() -> None:
    """Show title input, language selector, and audio recorder."""
    st.session_state.recording_title = st.text_input(
        "Recording title (optional)",
        value=st.session_state.recording_title,
        placeholder="e.g. AI Lecture - Week 5",
    )

    lang_labels = [label for label, _ in _LANGUAGE_OPTIONS]
    lang_values = [value for _, value in _LANGUAGE_OPTIONS]
    current = st.session_state.transcription_language
    current_idx = lang_values.index(current) if current in lang_values else 0
    selected_idx = st.selectbox(
        "Transcription language",
        range(len(lang_labels)),
        index=current_idx,
        format_func=lambda i: lang_labels[i],
    )
    st.session_state.transcription_language = lang_values[selected_idx]

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

    # Detected language
    detected_lang = st.session_state.detected_language
    if detected_lang:
        prob = st.session_state.detected_language_prob
        prob_pct = f"{prob * 100:.1f}%" if prob else "N/A"
        st.markdown(f"**Detected language**: {detected_lang} — Confidence: {prob_pct}")

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

    # Open recordings folder
    if st.button("Open Recordings Folder"):
        open_folder_in_explorer(get_settings().recordings_dir)

    # Reset button
    if st.button("New Recording"):
        st.session_state.recording_id = None
        st.session_state.recording_status = "idle"
        st.session_state.recording_title = ""
        st.session_state.transcripts = []
        st.session_state.transcript_text = ""
        st.session_state.summaries = []
        st.session_state.transcription_language = None
        st.session_state.detected_language = None
        st.session_state.detected_language_prob = 0.0
        st.rerun()
