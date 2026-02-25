"""
VoiceVault Streamlit UI — main entry point.

Run with: ``streamlit run src/ui/app.py``

.. deprecated::
    This Streamlit UI is deprecated as of v0.4.0 and will be removed in v0.6.0.
    The Next.js frontend (``frontend/``) is the primary UI going forward.
    New features will only be added to the Next.js frontend.
    See docs/streamlit-deprecation-plan.md for the full migration timeline.
"""

# ---------------------------------------------------------------------------
# Ensure project root is on sys.path so ``from src.xxx`` imports work.
# Streamlit replaces sys.path[0] with the script directory (src/ui/),
# which removes the project root needed for absolute ``src.*`` imports.
# ---------------------------------------------------------------------------
import sys  # noqa: E402
from pathlib import Path  # noqa: E402

_project_root = str(Path(__file__).resolve().parent.parent.parent)
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

import streamlit as st  # noqa: E402

st.warning(
    "Streamlit UI is deprecated. Use the Next.js frontend instead: "
    "`cd frontend && pnpm dev` (http://localhost:3000). "
    "This UI will be removed in v0.6.0."
)

from src.core.config import get_settings  # noqa: E402
from src.ui.utils import open_folder_in_explorer  # noqa: E402

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
    "recording_context": "",
    "transcripts": [],
    "transcript_text": "",
    "summaries": [],
    "transcription_language": None,
    "detected_language": None,
    "detected_language_prob": 0.0,
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
    st.warning(
        "**Deprecated UI** — This Streamlit interface is deprecated as of v0.4.0. "
        "Please use the Next.js frontend at http://localhost:3000. "
        "This UI will be removed in v0.6.0."
    )
    st.divider()
    st.session_state.api_base_url = st.text_input(
        "Backend API URL",
        value=st.session_state.api_base_url,
        help="URL of the VoiceVault FastAPI backend server (default: http://localhost:8000)",
    )

    # Connection status indicator
    from src.ui.api_client import get_api_client  # noqa: E402

    _client = get_api_client(st.session_state.get("api_base_url", "http://localhost:8000"))
    _conn_ok, _conn_msg = _client.check_connection()
    if _conn_ok:
        st.success(f"Backend: {_conn_msg}")
    else:
        st.error(f"Backend: {_conn_msg}")

    # Storage folder shortcuts
    st.divider()
    st.subheader("Storage Folders")
    _settings = get_settings()

    if st.button("Open Recordings Folder", use_container_width=True):
        open_folder_in_explorer(_settings.recordings_dir)

    if st.button("Open Exports Folder", use_container_width=True):
        open_folder_in_explorer(_settings.exports_dir)

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


@st.dialog("Recording in Progress")
def _confirm_navigation():
    status = st.session_state.recording_status
    if status == "processing":
        st.warning(
            "Audio is currently being processed. Navigating away will interrupt "
            "processing and recording data will be lost."
        )
    else:
        st.info("You have a completed recording that hasn't been reviewed yet.")
    col1, col2 = st.columns(2)
    with col1:
        if st.button("Go to Recording", type="primary", use_container_width=True):
            st.switch_page(recording_page)
    with col2:
        if st.button("Leave", use_container_width=True):
            st.session_state.recording_status = "idle"
            st.session_state.pop("_pending_audio", None)
            st.rerun()


nav = st.navigation([recording_page, summaries_page, rag_search_page, export_page, templates_page])

if st.session_state.recording_status in ("processing", "completed") and nav != recording_page:
    _confirm_navigation()
    if st.session_state.recording_status == "processing":
        recording_page.run()
    else:
        nav.run()
else:
    nav.run()
