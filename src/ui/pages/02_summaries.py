"""
Summaries browsing page — list recordings and their summaries.
"""

# Ensure project root is on sys.path (Streamlit page files need this).
import sys as _sys
from pathlib import Path as _Path

_r = str(_Path(__file__).resolve().parents[3])
_r in _sys.path or _sys.path.insert(0, _r)  # noqa: E702,I001

import streamlit as st  # noqa: E402

from src.ui.api_client import get_api_client  # noqa: E402
from src.ui.components.summary_card import render_summary_list  # noqa: E402

st.header("Summaries")

client = get_api_client()

# -- Filters --
status_filter = st.selectbox(
    "Filter by status",
    options=["all", "active", "completed", "failed"],
    index=0,
)

# -- Fetch recordings --
try:
    status_param = None if status_filter == "all" else status_filter
    recordings = client.list_recordings(status=status_param)
except Exception as exc:
    st.error(f"Could not fetch recordings: {exc}")
    recordings = []

if not recordings:
    st.info("No recordings found. Go to the Recording page to create one.")
    st.stop()

st.caption(f"{len(recordings)} recording(s)")

for rec in recordings:
    rec_id = rec["id"]
    label = rec.get("title") or f"Recording #{rec_id}"
    started = rec.get("started_at", "")[:19].replace("T", " ")
    status = rec.get("status", "unknown")
    minutes = rec.get("total_minutes", 0)

    with st.expander(f"{label}  |  {status}  |  {started}  |  {minutes} min"):
        # -- Audio player & download --
        if rec.get("audio_path"):
            audio_key = f"audio_bytes_{rec_id}"
            if audio_key not in st.session_state:
                st.session_state[audio_key] = client.download_audio(rec_id)

            audio_bytes = st.session_state[audio_key]
            if audio_bytes:
                start_time = st.session_state.get(f"audio_start_{rec_id}", 0)
                st.audio(audio_bytes, format="audio/wav", start_time=start_time)
                st.download_button(
                    "Download WAV",
                    data=audio_bytes,
                    file_name=f"recording-{rec_id}.wav",
                    mime="audio/wav",
                    key=f"dl_{rec_id}",
                )

        col1, col2, col3 = st.columns([3, 1, 1])
        with col1:
            st.markdown(f"**ID**: {rec_id}  \n**Status**: {status}")
        with col2:
            if st.button("Load summaries", key=f"load_{rec_id}"):
                try:
                    summaries = client.list_summaries(rec_id)
                    if summaries:
                        render_summary_list(summaries, recording_id=rec_id)
                    else:
                        st.info("No summaries yet for this recording.")
                except Exception as exc:
                    st.error(f"Failed to load summaries: {exc}")
        with col3:
            if st.button("Find similar", key=f"similar_{rec_id}"):
                try:
                    similar = client.rag_similar(rec_id)
                    if similar:
                        st.markdown("**Similar recordings**")
                        for item in similar:
                            with st.container(border=True):
                                sim_id = item.get("recording_id", "?")
                                sim_score = item.get("similarity", 0.0)
                                sim_text = item.get("summary_text", "")
                                st.markdown(f"Recording #{sim_id} ({sim_score:.0%})")
                                st.caption(sim_text[:200])
                    else:
                        st.info("No similar recordings found.")
                except Exception as exc:
                    st.error(f"Failed to find similar: {exc}")
