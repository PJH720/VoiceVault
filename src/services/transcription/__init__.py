"""
Transcription module - Speech-to-text abstraction layer.

Factory function for creating STT instances based on provider configuration.
"""

from .base import BaseSTT

__all__ = ["BaseSTT", "create_stt"]


def create_stt(provider: str, **kwargs) -> BaseSTT:
    """
    Factory function to create STT instance based on provider.

    Args:
        provider: STT provider name ("whisper", "openai", etc.)
        **kwargs: Provider-specific configuration

    Returns:
        BaseSTT implementation instance

    Raises:
        ValueError: If provider is unknown
    """
    if provider == "whisper" or provider == "local":
        from .whisper import WhisperSTT
        return WhisperSTT(**kwargs)
    else:
        raise ValueError(f"Unknown STT provider: {provider}")
