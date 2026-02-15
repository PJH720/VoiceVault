"""
Classification module - Audio recording classification services.
"""

from src.services.llm.base import BaseLLM

from .classifier import ZeroShotClassifier
from .template_matcher import TemplateMatcher

__all__ = ["ZeroShotClassifier", "TemplateMatcher", "create_classifier"]


def create_classifier(llm: BaseLLM) -> ZeroShotClassifier:
    """Factory function to create a ZeroShotClassifier instance.

    Args:
        llm: The LLM provider to use for classification.

    Returns:
        A configured ZeroShotClassifier.
    """
    return ZeroShotClassifier(llm)
