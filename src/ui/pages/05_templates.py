"""
Template management page — view, create, edit, and delete classification templates.

Templates define the structure of Obsidian exports for each recording category.
Each template has trigger keywords for matching, priority for ordering, and
configurable output fields (summary, key_concepts, action_items, etc.).
"""

# Ensure project root is on sys.path (Streamlit page files need this).
import sys as _sys
from pathlib import Path as _Path

_r = str(_Path(__file__).resolve().parents[3])
_r in _sys.path or _sys.path.insert(0, _r)  # noqa: E702,I001

import json  # noqa: E402

import streamlit as st  # noqa: E402

from src.ui.api_client import get_api_client  # noqa: E402
from src.ui.components.template_card import render_template_card  # noqa: E402

st.header("Classification Templates")

client = get_api_client(st.session_state.get("api_base_url", "http://localhost:8000"))

# ---------------------------------------------------------------------------
# Create new template
# ---------------------------------------------------------------------------
with st.expander("Create New Template"):
    with st.form("create_template_form", clear_on_submit=True):
        c_name = st.text_input("Name (unique identifier)", placeholder="lecture_note")
        c_display = st.text_input("Display Name", placeholder="Lecture Note")
        c_triggers = st.text_input(
            "Triggers (comma-separated)",
            placeholder="lecture, class, professor, exam",
        )
        c_format = st.selectbox("Output Format", options=["markdown", "json", "text"])
        c_fields_raw = st.text_area(
            "Fields (JSON array)",
            placeholder='[{"name": "topic", "type": "string"}, {"name": "key_points", "type": "list"}]',
            height=100,
        )
        c_icon = st.text_input("Icon (emoji)", placeholder="📚")
        c_priority = st.number_input("Priority", min_value=0, max_value=100, value=50)

        submitted = st.form_submit_button("Create Template")
        if submitted:
            if not c_name.strip():
                st.error("Name is required.")
            else:
                # Parse fields JSON
                fields = []
                if c_fields_raw.strip():
                    try:
                        fields = json.loads(c_fields_raw)
                    except json.JSONDecodeError:
                        st.error("Fields must be valid JSON array.")
                        st.stop()

                data = {
                    "name": c_name.strip(),
                    "display_name": c_display.strip(),
                    "triggers": [t.strip() for t in c_triggers.split(",") if t.strip()],
                    "output_format": c_format,
                    "fields": fields,
                    "icon": c_icon.strip(),
                    "priority": c_priority,
                }
                try:
                    result = client.create_template(data)
                    st.success(f"Template '{result.get('name')}' created!")
                    st.rerun()
                except Exception as exc:
                    st.error(f"Failed to create template: {exc}")

# ---------------------------------------------------------------------------
# Fetch & display templates
# ---------------------------------------------------------------------------
try:
    templates = client.list_templates()
except Exception as exc:
    st.error(f"Could not fetch templates: {exc}")
    templates = []

if not templates:
    st.info("No templates found. Create one above.")
    st.stop()

st.caption(f"{len(templates)} template(s)")

for tmpl in templates:
    tmpl_id = tmpl["id"]
    edit_key = f"edit_{tmpl_id}"
    delete_key = f"delete_{tmpl_id}"

    render_template_card(tmpl, on_edit_key=edit_key, on_delete_key=delete_key)

    # -- Delete flow --
    if st.session_state.get(delete_key):
        with st.container():
            st.warning(f"Delete template **{tmpl.get('display_name') or tmpl['name']}**?")
            confirm_col, cancel_col, _ = st.columns([1, 1, 3])
            with confirm_col:
                if st.button("Confirm Delete", key=f"confirm_del_{tmpl_id}"):
                    try:
                        client.delete_template(tmpl_id)
                        st.success("Template deleted.")
                        st.rerun()
                    except Exception as exc:
                        st.error(f"Failed to delete: {exc}")
            with cancel_col:
                if st.button("Cancel", key=f"cancel_del_{tmpl_id}"):
                    st.rerun()

    # -- Edit flow --
    if st.session_state.get(edit_key):
        with st.expander(f"Editing: {tmpl.get('display_name') or tmpl['name']}", expanded=True):
            with st.form(f"edit_form_{tmpl_id}"):
                e_display = st.text_input(
                    "Display Name",
                    value=tmpl.get("display_name", ""),
                )
                e_triggers = st.text_input(
                    "Triggers (comma-separated)",
                    value=", ".join(tmpl.get("triggers", [])),
                )
                e_format = st.selectbox(
                    "Output Format",
                    options=["markdown", "json", "text"],
                    index=["markdown", "json", "text"].index(tmpl.get("output_format", "markdown")),
                    key=f"fmt_{tmpl_id}",
                )
                e_fields_raw = st.text_area(
                    "Fields (JSON array)",
                    value=json.dumps(tmpl.get("fields", []), indent=2),
                    height=100,
                    key=f"fields_{tmpl_id}",
                )
                e_icon = st.text_input("Icon", value=tmpl.get("icon", ""), key=f"icon_{tmpl_id}")
                e_priority = st.number_input(
                    "Priority",
                    min_value=0,
                    max_value=100,
                    value=tmpl.get("priority", 50),
                    key=f"prio_{tmpl_id}",
                )

                save = st.form_submit_button("Save Changes")
                if save:
                    fields = []
                    if e_fields_raw.strip():
                        try:
                            fields = json.loads(e_fields_raw)
                        except json.JSONDecodeError:
                            st.error("Fields must be valid JSON array.")
                            st.stop()

                    patch_data = {
                        "display_name": e_display.strip(),
                        "triggers": [t.strip() for t in e_triggers.split(",") if t.strip()],
                        "output_format": e_format,
                        "fields": fields,
                        "icon": e_icon.strip(),
                        "priority": e_priority,
                    }
                    try:
                        client.update_template(tmpl_id, patch_data)
                        st.success("Template updated!")
                        st.rerun()
                    except Exception as exc:
                        st.error(f"Failed to update: {exc}")
