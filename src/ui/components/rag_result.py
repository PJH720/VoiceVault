"""
RAG search result display components.

Provides Streamlit components for rendering RAG query answers with
source citations, similarity progress bars, and metadata.
"""

import streamlit as st


def render_rag_answer(result: dict) -> None:
    """Render the RAG answer card with model and timing metadata."""
    with st.container(border=True):
        st.markdown("### Answer")
        st.write(result.get("answer", ""))

        col1, col2 = st.columns(2)
        with col1:
            model = result.get("model_used", "unknown")
            st.caption(f"Model: {model}")
        with col2:
            query_time = result.get("query_time_ms", 0)
            st.caption(f"Query time: {query_time}ms")


def render_source_list(sources: list[dict]) -> None:
    """Render source cards with similarity progress bars."""
    if not sources:
        st.info("No sources found.")
        return

    st.markdown(f"### Sources ({len(sources)})")
    for src in sources:
        with st.container(border=True):
            col1, col2 = st.columns([3, 1])
            with col1:
                rec_id = src.get("recording_id", "?")
                minute = src.get("minute_index", "?")
                category = src.get("category", "")
                date = src.get("date", "")
                label = f"Recording #{rec_id} - Minute {minute}"
                if category:
                    label += f"  |  {category}"
                if date:
                    label += f"  |  {date[:10]}"
                st.markdown(f"**{label}**")
            with col2:
                similarity = src.get("similarity", 0.0)
                st.progress(similarity, text=f"{similarity:.0%}")

            st.write(src.get("summary_text", ""))


def render_rag_result(result: dict) -> None:
    """Convenience wrapper: render the full RAG result (answer + sources)."""
    render_rag_answer(result)
    render_source_list(result.get("sources", []))
