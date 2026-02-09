"""
Recording page — capture audio, send to backend, display transcription.

UX flow: idle -> processing -> completed
Uses ``st.audio_input()`` for batch audio capture (MVP approach).
"""

import streamlit as st

from src.ui.components.recorder import render_recorder

st.header("Recording")
render_recorder()
