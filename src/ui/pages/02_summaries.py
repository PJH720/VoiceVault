"""
Summaries browsing page — list recordings and their summaries.
"""

import streamlit as st

from src.ui.api_client import get_api_client
from src.ui.components.summary_card import render_summary_list

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
    label = rec.get("title") or f"Recording #{rec['id']}"
    started = rec.get("started_at", "")[:19].replace("T", " ")
    status = rec.get("status", "unknown")
    minutes = rec.get("total_minutes", 0)

    with st.expander(f"{label}  |  {status}  |  {started}  |  {minutes} min"):
        col1, col2, col3 = st.columns([3, 1, 1])
        with col1:
            st.markdown(f"**ID**: {rec['id']}  \n**Status**: {status}")
        with col2:
            if st.button("Load summaries", key=f"load_{rec['id']}"):
                try:
                    summaries = client.list_summaries(rec["id"])
                    if summaries:
                        render_summary_list(summaries)
                    else:
                        st.info("No summaries yet for this recording.")
                except Exception as exc:
                    st.error(f"Failed to load summaries: {exc}")
        with col3:
            if st.button("Find similar", key=f"similar_{rec['id']}"):
                try:
                    similar = client.rag_similar(rec["id"])
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
