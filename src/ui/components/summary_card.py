"""
Summary card display components.
"""

import streamlit as st


def render_summary_card(
    summary: dict,
    recording_id: int | None = None,
) -> None:
    """Render a single summary as a styled card.

    Args:
        summary: Summary dict from the API.
        recording_id: When provided, adds a "Play from here" button that
            sets ``st.session_state[f"audio_start_{recording_id}"]`` to
            the minute offset so the audio player can jump there.
    """
    minute = summary.get("minute_index", "?")
    text = summary.get("summary_text", "")
    keywords = summary.get("keywords", [])
    confidence = summary.get("confidence", 0.0)

    with st.container(border=True):
        col1, col2, col3 = st.columns([4, 1, 1])
        with col1:
            st.markdown(f"**Minute {minute}**")
        with col2:
            if confidence > 0:
                st.caption(f"conf: {confidence:.0%}")
        with col3:
            if recording_id is not None and isinstance(minute, int):
                if st.button(
                    "Play from here",
                    key=f"play_{recording_id}_{minute}",
                ):
                    st.session_state[f"audio_start_{recording_id}"] = minute * 60

        st.write(text)

        if keywords:
            tags = " ".join(f"`{kw}`" for kw in keywords)
            st.markdown(tags)

        corrections = summary.get("corrections", [])
        if corrections:
            with st.expander(f"Corrections ({len(corrections)})"):
                for c in corrections:
                    st.markdown(f"~~{c['original']}~~ -> **{c['corrected']}**")
                    if c.get("reason"):
                        st.caption(c["reason"])


def render_summary_list(
    summaries: list[dict],
    recording_id: int | None = None,
    page_size: int = 10,
) -> None:
    """Render a list of summaries with a count header and pagination."""
    st.caption(f"{len(summaries)} summary(ies)")

    if len(summaries) <= page_size:
        for s in summaries:
            render_summary_card(s, recording_id=recording_id)
        return

    # Paginate for large lists
    page_key = f"_summary_page_{recording_id or 'default'}"
    page = st.session_state.get(page_key, 0)
    total_pages = (len(summaries) + page_size - 1) // page_size
    page = min(page, total_pages - 1)

    start = page * page_size
    end = min(start + page_size, len(summaries))

    for s in summaries[start:end]:
        render_summary_card(s, recording_id=recording_id)

    col_prev, col_info, col_next = st.columns([1, 2, 1])
    with col_prev:
        if page > 0:
            if st.button("Previous", key=f"sum_prev_{recording_id}"):
                st.session_state[page_key] = page - 1
                st.rerun()
    with col_info:
        st.caption(f"Page {page + 1} / {total_pages}")
    with col_next:
        if page < total_pages - 1:
            if st.button("Next", key=f"sum_next_{recording_id}"):
                st.session_state[page_key] = page + 1
                st.rerun()
