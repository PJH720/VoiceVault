"""Shared utility functions for VoiceVault."""

import re


def strip_code_fences(text: str) -> str:
    """Remove markdown code fences wrapping JSON from LLM responses."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```\w*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    return text.strip()
