"""
Template card display component.
"""

import streamlit as st


def render_template_card(
    template: dict,
    on_edit_key: str,
    on_delete_key: str,
) -> None:
    """Render a single template as a bordered card with edit/delete actions."""
    name = template.get("name", "")
    display_name = template.get("display_name") or name
    icon = template.get("icon", "")
    priority = template.get("priority", 0)
    triggers = template.get("triggers", [])
    fields = template.get("fields", [])
    is_default = template.get("is_default", False)
    output_format = template.get("output_format", "markdown")

    with st.container(border=True):
        # Header row: icon + name + badges
        header_col, badge_col = st.columns([3, 1])
        with header_col:
            title = f"{icon} {display_name}" if icon else display_name
            st.markdown(f"**{title}**")
            st.caption(f"`{name}` | format: {output_format}")
        with badge_col:
            badges = f"priority: **{priority}**"
            if is_default:
                badges += "  \nDefault"
            st.markdown(badges)

        # Triggers
        if triggers:
            tags = " ".join(f"`{t}`" for t in triggers)
            st.markdown(f"Triggers: {tags}")

        # Fields
        if fields:
            field_names = [f.get("name", str(f)) for f in fields]
            st.caption(f"Fields: {', '.join(field_names)}")

        # Action buttons
        btn_col1, btn_col2, _ = st.columns([1, 1, 3])
        with btn_col1:
            st.button("Edit", key=on_edit_key)
        with btn_col2:
            st.button("Delete", key=on_delete_key, disabled=is_default)
