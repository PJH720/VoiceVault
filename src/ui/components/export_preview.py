"""
Obsidian export preview components.

Provides tabbed preview of exported Markdown: rendered view, raw source,
and frontmatter key-value table.
"""

import streamlit as st


def render_frontmatter_table(frontmatter: dict) -> None:
    """Render frontmatter as a key-value table."""
    if not frontmatter:
        st.info("No frontmatter available.")
        return

    rows = []
    for key, value in frontmatter.items():
        if isinstance(value, list):
            value = ", ".join(str(v) for v in value)
        rows.append({"Field": key, "Value": str(value)})
    st.table(rows)


def render_export_preview(export_result: dict) -> None:
    """Render a tabbed preview of the Markdown export.

    Tabs: "Rendered" (markdown display), "Raw Markdown" (code block),
    "Frontmatter" (key-value table).

    Args:
        export_result: Dict from the export API with ``markdown_content``,
            ``frontmatter``, and ``file_path`` keys.
    """
    markdown_content = export_result.get("markdown_content", "")
    frontmatter = export_result.get("frontmatter", {})
    file_path = export_result.get("file_path", "")

    if file_path:
        st.caption(f"Export path: {file_path}")

    tab_rendered, tab_raw, tab_frontmatter = st.tabs(["Rendered", "Raw Markdown", "Frontmatter"])

    with tab_rendered:
        st.markdown(markdown_content)

    with tab_raw:
        st.code(markdown_content, language="markdown")

    with tab_frontmatter:
        render_frontmatter_table(frontmatter)
