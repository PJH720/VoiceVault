"""
Obsidian Export page — export recordings as Obsidian-compatible Markdown.
"""

# Ensure project root is on sys.path (Streamlit page files need this).
import sys as _sys
from pathlib import Path as _Path

_r = str(_Path(__file__).resolve().parents[3])
_r in _sys.path or _sys.path.insert(0, _r)  # noqa: E702,I001

import streamlit as st  # noqa: E402

from src.ui.api_client import get_api_client  # noqa: E402
from src.ui.components.export_preview import render_export_preview  # noqa: E402

st.header("Obsidian Export")

client = get_api_client()

# ---------------------------------------------------------------------------
# Sidebar settings
# ---------------------------------------------------------------------------
with st.sidebar:
    st.subheader("Export Settings")

    vault_path = st.text_input(
        "Vault path (optional)",
        value=st.session_state.get("export_vault_path", ""),
        placeholder="/path/to/obsidian/vault",
        key="export_vault_path_input",
    )

    export_format = st.selectbox(
        "Format",
        options=["obsidian", "markdown", "json"],
        index=0,
        key="export_format_select",
    )

    include_transcript = st.checkbox(
        "Include full transcript",
        value=st.session_state.get("export_include_transcript", False),
        key="export_transcript_check",
    )

# ---------------------------------------------------------------------------
# Fetch completed recordings
# ---------------------------------------------------------------------------
try:
    recordings = client.list_recordings(status="completed")
except Exception as exc:
    st.error(f"Could not fetch recordings: {exc}")
    recordings = []

if not recordings:
    st.info("No completed recordings found. Complete a recording first.")
    st.stop()

# ---------------------------------------------------------------------------
# Recording selection
# ---------------------------------------------------------------------------
st.subheader("Select recordings to export")

selected_ids: list[int] = []
for rec in recordings:
    label = rec.get("title") or f"Recording #{rec['id']}"
    started = rec.get("started_at", "")[:19].replace("T", " ")
    minutes = rec.get("total_minutes", 0)
    checked = st.checkbox(
        f"{label}  |  {started}  |  {minutes} min",
        key=f"export_sel_{rec['id']}",
    )
    if checked:
        selected_ids.append(rec["id"])

st.caption(f"{len(selected_ids)} recording(s) selected")

# ---------------------------------------------------------------------------
# Preview
# ---------------------------------------------------------------------------
col_preview, col_export = st.columns(2)

with col_preview:
    if st.button("Preview", disabled=not selected_ids):
        rec_id = selected_ids[0]
        with st.spinner("Generating preview..."):
            try:
                result = client.export_recording(
                    recording_id=rec_id,
                    format=export_format,
                    include_transcript=include_transcript,
                    vault_path=vault_path or None,
                )
                st.session_state.export_preview = result
            except Exception as exc:
                st.error(f"Preview failed: {exc}")
                st.session_state.export_preview = None

preview = st.session_state.get("export_preview")
if preview:
    render_export_preview(preview)

    st.download_button(
        label="Download Markdown",
        data=preview.get("markdown_content", ""),
        file_name=preview.get("file_path", "export.md").split("/")[-1],
        mime="text/markdown",
    )

# ---------------------------------------------------------------------------
# Export All
# ---------------------------------------------------------------------------
with col_export:
    if st.button("Export All", type="primary", disabled=not selected_ids):
        progress = st.progress(0, text="Exporting...")
        results: list[dict] = []
        errors: list[str] = []

        for i, rec_id in enumerate(selected_ids):
            try:
                result = client.export_recording(
                    recording_id=rec_id,
                    format=export_format,
                    include_transcript=include_transcript,
                    vault_path=vault_path or None,
                )
                results.append(result)
            except Exception as exc:
                errors.append(f"Recording #{rec_id}: {exc}")

            progress.progress(
                (i + 1) / len(selected_ids),
                text=f"Exported {i + 1}/{len(selected_ids)}",
            )

        if results:
            st.success(f"Successfully exported {len(results)} recording(s).")
            for r in results:
                st.caption(f"  {r.get('file_path', '')}")
        if errors:
            st.warning(f"{len(errors)} export(s) failed:")
            for e in errors:
                st.error(e)
