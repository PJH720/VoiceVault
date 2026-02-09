"""
Summarization module - Text summarization services.
"""

from .base import BaseSummarizer
from .minute_summarizer import MinuteSummarizer

__all__ = ["BaseSummarizer", "MinuteSummarizer"]
