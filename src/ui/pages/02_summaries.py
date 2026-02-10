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

col_title, col_refresh = st.columns([6, 1])
with col_title:
    st.header("Summaries")
with col_refresh:
    st.markdown("")  # vertical spacer
    if st.button("Refresh", key="summaries_refresh"):
        st.rerun()

client = get_api_client()

PAGE_SIZE = 10

# -- Sidebar: Folder sync --
with st.sidebar:
    st.subheader("Folder Sync")
    if st.button("Sync from folder", key="summaries_sync"):
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

    st.divider()
    st.subheader("Consistency Check")
    if st.button("Check consistency", key="summaries_consistency"):
        with st.spinner("Checking DB / filesystem consistency..."):
            try:
                cr = client.check_consistency()
                st.session_state["consistency_result"] = cr
                orphan_recs = len(cr.get("orphan_records", []))
                orphan_files = len(cr.get("orphan_files", []))
                healthy = cr.get("healthy_count", 0)
                if orphan_recs == 0 and orphan_files == 0:
                    st.success(f"All consistent ({healthy} healthy)")
                else:
                    st.warning(
                        f"Healthy: {healthy} | "
                        f"Missing files: {orphan_recs} | "
                        f"Unregistered files: {orphan_files}"
                    )
            except Exception as exc:
                st.error(f"Consistency check failed: {exc}")

# -- Filters --
status_filter = st.selectbox(
    "Filter by status",
    options=["all", "active", "completed", "imported", "failed"],
    index=0,
)

# Reset page when filter changes
if st.session_state.get("_summaries_last_filter") != status_filter:
    st.session_state["_summaries_page"] = 0
    st.session_state["_summaries_last_filter"] = status_filter

page = st.session_state.get("_summaries_page", 0)

# -- Fetch recordings (paginated) --
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
        st.info("No recordings found. Go to the Recording page to create one.")
    else:
        st.info("No more recordings.")
    st.stop()

st.caption(f"Showing {len(recordings)} recording(s) (page {page + 1})")

for rec in recordings:
    rec_id = rec["id"]
    label = rec.get("title") or f"Recording #{rec_id}"
    started = rec.get("started_at", "")[:19].replace("T", " ")
    status = rec.get("status", "unknown")
    minutes = rec.get("total_minutes", 0)

    with st.expander(f"{label}  |  {status}  |  {started}  |  {minutes} min"):
        # -- Lazy audio loading --
        if rec.get("audio_path"):
            audio_key = f"audio_bytes_{rec_id}"
            if audio_key in st.session_state and st.session_state[audio_key]:
                audio_bytes = st.session_state[audio_key]
                start_time = st.session_state.get(f"audio_start_{rec_id}", 0)
                st.audio(audio_bytes, format="audio/wav", start_time=start_time)
                st.download_button(
                    "Download WAV",
                    data=audio_bytes,
                    file_name=f"recording-{rec_id}.wav",
                    mime="audio/wav",
                    key=f"dl_{rec_id}",
                )
            else:
                if st.button("Load audio", key=f"load_audio_{rec_id}"):
                    audio_bytes = client.download_audio(rec_id)
                    st.session_state[audio_key] = audio_bytes
                    st.rerun()

        col1, col2, col3, col4 = st.columns([3, 1, 1, 1])
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
        with col4:
            confirm_key = f"_confirm_delete_{rec_id}"
            if st.session_state.get(confirm_key):
                if st.button("Confirm delete", key=f"del_confirm_{rec_id}", type="primary"):
                    try:
                        client.delete_recording(rec_id)
                        st.success(f"Recording #{rec_id} deleted.")
                        st.session_state.pop(confirm_key, None)
                        st.rerun()
                    except Exception as exc:
                        st.error(f"Delete failed: {exc}")
            else:
                if status == "active":
                    st.button(
                        "Delete", key=f"del_{rec_id}", disabled=True, help="Stop recording first"
                    )
                elif st.button("Delete", key=f"del_{rec_id}"):
                    st.session_state[confirm_key] = True
                    st.rerun()

# -- Orphan management (shown when consistency check found issues) --
cr = st.session_state.get("consistency_result")
if cr:
    orphan_recs = cr.get("orphan_records", [])
    orphan_files = cr.get("orphan_files", [])

    if orphan_recs:
        with st.expander(f"Missing audio files ({len(orphan_recs)} DB records)", expanded=False):
            st.caption("These DB records point to audio files that no longer exist on disk.")
            for orec in orphan_recs:
                st.markdown(
                    f"- **#{orec['id']}** {orec.get('title') or 'Untitled'} "
                    f"({orec.get('status', '?')})"
                )
            if st.button("Delete all orphan records", key="cleanup_orphan_recs"):
                with st.spinner("Deleting orphan records..."):
                    try:
                        ids = [o["id"] for o in orphan_recs]
                        res = client.consistency_cleanup("delete_records", record_ids=ids)
                        st.success(f"Deleted {res.get('processed', 0)} record(s)")
                        if res.get("errors"):
                            for err in res["errors"]:
                                st.warning(err)
                        st.session_state.pop("consistency_result", None)
                        st.rerun()
                    except Exception as exc:
                        st.error(f"Cleanup failed: {exc}")

    if orphan_files:
        with st.expander(f"Unregistered files ({len(orphan_files)} files)", expanded=False):
            st.caption("These audio files exist on disk but have no matching DB record.")
            for ofile in orphan_files:
                size_kb = ofile.get("size_bytes", 0) / 1024
                st.markdown(f"- **{ofile['file_name']}** ({size_kb:.0f} KB)")
            col_import, col_del_files = st.columns(2)
            with col_import:
                if st.button("Import all to DB", key="cleanup_import_files"):
                    with st.spinner("Importing files..."):
                        try:
                            res = client.consistency_cleanup("import_files")
                            st.success(f"Imported {res.get('processed', 0)} file(s)")
                            st.session_state.pop("consistency_result", None)
                            st.rerun()
                        except Exception as exc:
                            st.error(f"Import failed: {exc}")
            with col_del_files:
                if st.button("Delete all orphan files", key="cleanup_del_files"):
                    with st.spinner("Deleting orphan files..."):
                        try:
                            paths = [o["file_path"] for o in orphan_files]
                            res = client.consistency_cleanup("delete_files", file_paths=paths)
                            st.success(f"Deleted {res.get('processed', 0)} file(s)")
                            if res.get("errors"):
                                for err in res["errors"]:
                                    st.warning(err)
                            st.session_state.pop("consistency_result", None)
                            st.rerun()
                        except Exception as exc:
                            st.error(f"Cleanup failed: {exc}")

# -- Pagination controls --
col_prev, col_info, col_next = st.columns([1, 2, 1])
with col_prev:
    if page > 0:
        if st.button("Previous"):
            st.session_state["_summaries_page"] = page - 1
            st.rerun()
with col_next:
    if len(recordings) == PAGE_SIZE:
        if st.button("Next"):
            st.session_state["_summaries_page"] = page + 1
            st.rerun()
