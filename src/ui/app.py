"""
VoiceVault Streamlit UI — main entry point.

Run with: ``streamlit run src/ui/app.py``
"""

import streamlit as st

# ---------------------------------------------------------------------------
# Page config (must be first Streamlit call)
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="VoiceVault",
    page_icon="\U0001f399\ufe0f",
    layout="wide",
)

# ---------------------------------------------------------------------------
# Session state defaults
# ---------------------------------------------------------------------------
_DEFAULTS = {
    "api_base_url": "http://localhost:8000",
    "recording_id": None,
    "recording_status": "idle",
    "recording_title": "",
    "transcripts": [],
    "transcript_text": "",
    "summaries": [],
}

for key, value in _DEFAULTS.items():
    if key not in st.session_state:
        st.session_state[key] = value

# ---------------------------------------------------------------------------
# Load custom CSS
# ---------------------------------------------------------------------------
from pathlib import Path  # noqa: E402

_css_path = Path(__file__).parent / "assets" / "styles.css"
if _css_path.exists():
    st.html(f"<style>{_css_path.read_text()}</style>")

# ---------------------------------------------------------------------------
# Sidebar
# ---------------------------------------------------------------------------
with st.sidebar:
    st.title("\U0001f399\ufe0f VoiceVault")
    st.caption("Record your day, let AI organize it")
    st.divider()
    st.session_state.api_base_url = st.text_input(
        "API URL",
        value=st.session_state.api_base_url,
    )

# ---------------------------------------------------------------------------
# Navigation (multipage)
# ---------------------------------------------------------------------------
recording_page = st.Page(
    "pages/01_recording.py",
    title="Recording",
    icon="\U0001f3a4",
    default=True,
)
summaries_page = st.Page(
    "pages/02_summaries.py",
    title="Summaries",
    icon="\U0001f4cb",
)

nav = st.navigation([recording_page, summaries_page])
nav.run()
