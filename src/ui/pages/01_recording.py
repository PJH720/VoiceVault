"""
Recording page — capture audio, send to backend, display transcription.

UX flow: idle -> processing -> completed
Uses ``st.audio_input()`` for batch audio capture (MVP approach).
"""

# Ensure project root is on sys.path (Streamlit page files need this).
import sys as _sys; from pathlib import Path as _Path; _r = str(_Path(__file__).resolve().parents[3]); _r in _sys.path or _sys.path.insert(0, _r)  # noqa: E702,I001

import streamlit as st  # noqa: E402

from src.ui.components.recorder import render_recorder  # noqa: E402

st.header("Recording")
render_recorder()
