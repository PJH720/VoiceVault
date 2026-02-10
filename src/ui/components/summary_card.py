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


def render_summary_list(
    summaries: list[dict],
    recording_id: int | None = None,
) -> None:
    """Render a list of summaries with a count header."""
    st.caption(f"{len(summaries)} summary(ies)")
    for s in summaries:
        render_summary_card(s, recording_id=recording_id)
