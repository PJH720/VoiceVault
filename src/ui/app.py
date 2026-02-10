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
    "rag_query": "",
    "rag_results": None,
    "rag_search_history": [],
    "export_selected_ids": [],
    "export_format": "obsidian",
    "export_vault_path": "",
    "export_include_transcript": False,
    "export_preview": None,
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
rag_search_page = st.Page(
    "pages/03_rag_search.py",
    title="RAG Search",
    icon="\U0001f50d",
)
export_page = st.Page(
    "pages/04_export.py",
    title="Export",
    icon="\U0001f4e4",
)
templates_page = st.Page(
    "pages/05_templates.py",
    title="Templates",
    icon="\U0001f4c4",
)

nav = st.navigation([recording_page, summaries_page, rag_search_page, export_page, templates_page])
nav.run()
