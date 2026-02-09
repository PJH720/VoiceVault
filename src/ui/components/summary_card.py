"""
Summary card display components.
"""

import streamlit as st


def render_summary_card(summary: dict) -> None:
    """Render a single summary as a styled card."""
    minute = summary.get("minute_index", "?")
    text = summary.get("summary_text", "")
    keywords = summary.get("keywords", [])
    confidence = summary.get("confidence", 0.0)

    with st.container(border=True):
        col1, col2 = st.columns([4, 1])
        with col1:
            st.markdown(f"**Minute {minute}**")
        with col2:
            if confidence > 0:
                st.caption(f"conf: {confidence:.0%}")

        st.write(text)

        if keywords:
            tags = " ".join(f"`{kw}`" for kw in keywords)
            st.markdown(tags)


def render_summary_list(summaries: list[dict]) -> None:
    """Render a list of summaries with a count header."""
    st.caption(f"{len(summaries)} summary(ies)")
    for s in summaries:
        render_summary_card(s)
