"""
LLM module - Language model abstraction layer.

Factory function for creating LLM instances based on provider configuration.
"""

from .base import BaseLLM

__all__ = ["BaseLLM", "create_llm"]


def create_llm(provider: str, **kwargs) -> BaseLLM:
    """
    Factory function to create LLM instance based on provider.

    Args:
        provider: LLM provider name ("ollama", "claude")
        **kwargs: Provider-specific configuration

    Returns:
        BaseLLM implementation instance

    Raises:
        ValueError: If provider is unknown
    """
    if provider == "ollama":
        from .ollama import OllamaLLM

        return OllamaLLM(**kwargs)
    elif provider == "claude":
        from .claude import ClaudeLLM

        return ClaudeLLM(**kwargs)
    else:
        raise ValueError(f"Unknown LLM provider: {provider}")
