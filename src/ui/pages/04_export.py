"""
Obsidian Export page — export recordings as Obsidian-compatible Markdown.

Features: recording selection, export format options, vault path config,
transcript inclusion toggle, preview (rendered + raw + frontmatter tabs),
batch export, and folder sync.
"""

# Ensure project root is on sys.path (Streamlit page files need this).
import sys as _sys
from pathlib import Path as _Path

_r = str(_Path(__file__).resolve().parents[3])
_r in _sys.path or _sys.path.insert(0, _r)  # noqa: E702,I001

from datetime import datetime  # noqa: E402

import streamlit as st  # noqa: E402

from src.core.config import get_settings  # noqa: E402
from src.ui.api_client import get_api_client  # noqa: E402
from src.ui.components.export_preview import render_export_preview  # noqa: E402
from src.ui.utils import open_folder_in_explorer  # noqa: E402

client = get_api_client(st.session_state.get("api_base_url", "http://localhost:8000"))

col_title, col_refresh = st.columns([6, 1])
with col_title:
    st.header("Obsidian Export")
with col_refresh:
    st.markdown("")  # vertical spacer
    if st.button("Refresh", key="export_refresh"):
        with st.spinner("Syncing recordings..."):
            try:
                result = client.sync_recordings()
                new = result.get("new_imports", 0)
                if new > 0:
                    st.session_state["_sync_toast"] = f"Imported {new} new recording(s)!"
            except Exception:
                pass  # sync failure shouldn't block refresh
        st.session_state["_last_refresh_export"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        st.rerun()

last_refresh = st.session_state.get("_last_refresh_export")
if last_refresh:
    st.caption(f"Last refresh: {last_refresh}")

if "_sync_toast" in st.session_state:
    st.success(st.session_state.pop("_sync_toast"))

PAGE_SIZE = 10

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

    st.divider()
    st.subheader("Folder Sync")
    if st.button("Sync from folder", key="export_sync"):
        with st.spinner("Scanning recordings folder..."):
            try:
                result = client.sync_recordings()
                new = result.get("new_imports", 0)
                scanned = result.get("scanned", 0)
                if new > 0:
                    st.success(f"Imported {new} new recording(s) (scanned {scanned} files)")
                else:
                    st.info(f"No new files found (scanned {scanned} files)")
                if result.get("errors"):
                    for err in result["errors"]:
                        st.warning(err)
                if new > 0:
                    st.rerun()
            except Exception as exc:
                st.error(f"Sync failed: {exc}")

# ---------------------------------------------------------------------------
# Persistent selection set
# ---------------------------------------------------------------------------
if "export_selected_all" not in st.session_state:
    st.session_state["export_selected_all"] = set()

# ---------------------------------------------------------------------------
# Fetch recordings (paginated, with status filter)
# ---------------------------------------------------------------------------
status_filter = st.selectbox(
    "Filter by status",
    options=["all", "active", "completed", "imported", "failed"],
    index=0,
    key="export_status_filter",
)

# Reset page when filter changes
if st.session_state.get("_export_last_filter") != status_filter:
    st.session_state["_export_page"] = 0
    st.session_state["_export_last_filter"] = status_filter

page = st.session_state.get("_export_page", 0)

try:
    status_param = None if status_filter == "all" else status_filter
    recordings = client.list_recordings(
        status=status_param,
        limit=PAGE_SIZE,
        offset=page * PAGE_SIZE,
    )
except Exception as exc:
    st.error(f"Could not fetch recordings: {exc}")
    recordings = []

if not recordings:
    if page == 0:
        st.info("No recordings found.")
    else:
        st.info("No more recordings.")
    st.stop()

# ---------------------------------------------------------------------------
# Recording selection
# ---------------------------------------------------------------------------
st.subheader("Select recordings to export")

selected_all: set = st.session_state["export_selected_all"]

for rec in recordings:
    rec_id = rec["id"]
    label = rec.get("title") or f"Recording #{rec_id}"
    started = rec.get("started_at", "")[:19].replace("T", " ")
    minutes = rec.get("total_minutes", 0)
    checked = st.checkbox(
        f"{label}  |  {started}  |  {minutes} min",
        value=rec_id in selected_all,
        key=f"export_sel_{rec_id}",
    )
    if checked:
        selected_all.add(rec_id)
    else:
        selected_all.discard(rec_id)

selected_ids = sorted(selected_all)

st.caption(f"{len(selected_ids)} recording(s) selected")

# -- Pagination controls --
col_prev, col_info, col_next = st.columns([1, 2, 1])
with col_prev:
    if page > 0:
        if st.button("Previous", key="export_prev"):
            st.session_state["_export_page"] = page - 1
            st.rerun()
with col_info:
    st.caption(f"Page {page + 1}")
with col_next:
    if len(recordings) == PAGE_SIZE:
        if st.button("Next", key="export_next"):
            st.session_state["_export_page"] = page + 1
            st.rerun()

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
            if st.button("Open Exports Folder"):
                open_folder_in_explorer(get_settings().exports_dir)
        if errors:
            st.warning(f"{len(errors)} export(s) failed:")
            for e in errors:
                st.error(e)
