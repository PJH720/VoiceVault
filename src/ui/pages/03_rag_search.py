"""
RAG Search page — query past recordings with natural language.
"""

# Ensure project root is on sys.path (Streamlit page files need this).
import sys as _sys; from pathlib import Path as _Path; _r = str(_Path(__file__).resolve().parents[3]); _r in _sys.path or _sys.path.insert(0, _r)  # noqa: E702,I001

import streamlit as st  # noqa: E402

from src.ui.api_client import get_api_client  # noqa: E402
from src.ui.components.rag_result import render_rag_result  # noqa: E402

st.header("RAG Search")

client = get_api_client()

# ---------------------------------------------------------------------------
# Sidebar filters
# ---------------------------------------------------------------------------
with st.sidebar:
    st.subheader("Search Filters")

    date_from = st.date_input("From date", value=None, key="rag_date_from")
    date_to = st.date_input("To date", value=None, key="rag_date_to")

    category = st.selectbox(
        "Category",
        options=["all", "lecture", "meeting", "conversation", "personal", "study"],
        index=0,
        key="rag_category",
    )

    top_k = st.slider("Number of results", min_value=1, max_value=20, value=5, key="rag_top_k")
    min_similarity = st.slider(
        "Min similarity",
        min_value=0.0,
        max_value=1.0,
        value=0.3,
        step=0.05,
        key="rag_min_similarity",
    )

# ---------------------------------------------------------------------------
# Main area — query input
# ---------------------------------------------------------------------------
query = st.text_input(
    "Ask a question about your recordings",
    value=st.session_state.get("rag_query", ""),
    placeholder="e.g. What did the professor say about LangChain?",
)

if st.button("Search", type="primary", disabled=not query.strip()):
    st.session_state.rag_query = query

    # Build optional filters
    cat_filter = None if category == "all" else category
    df = date_from.isoformat() if date_from else None
    dt = date_to.isoformat() if date_to else None

    with st.spinner("Searching..."):
        try:
            result = client.rag_query(
                query=query.strip(),
                top_k=top_k,
                min_similarity=min_similarity,
                date_from=df,
                date_to=dt,
                category=cat_filter,
            )
            st.session_state.rag_results = result

            # Add to search history
            history: list = st.session_state.get("rag_search_history", [])
            history.insert(0, {"query": query.strip(), "answer": result.get("answer", "")})
            # Keep last 20 entries
            st.session_state.rag_search_history = history[:20]

        except Exception as exc:
            st.error(f"Search failed: {exc}")
            st.session_state.rag_results = None

# ---------------------------------------------------------------------------
# Display results
# ---------------------------------------------------------------------------
results = st.session_state.get("rag_results")
if results:
    render_rag_result(results)
elif query.strip() and results is not None:
    st.info("No results found. Try a different query or adjust filters.")

# ---------------------------------------------------------------------------
# Search history
# ---------------------------------------------------------------------------
history = st.session_state.get("rag_search_history", [])
if history:
    with st.expander(f"Search history ({len(history)})"):
        for i, entry in enumerate(history):
            st.markdown(f"**{i + 1}.** {entry['query']}")
            st.caption(entry.get("answer", "")[:200])
            st.divider()
