"""
RAG module - Embedding and vector store abstraction layer.

Factory functions for creating embedding and vector store instances
based on provider configuration.
"""

from .base import BaseEmbedding, BaseVectorStore
from .retriever import RAGRetriever

__all__ = [
    "BaseEmbedding",
    "BaseVectorStore",
    "RAGRetriever",
    "create_embedding",
    "create_vectorstore",
]


def create_embedding(provider: str, **kwargs) -> BaseEmbedding:
    """Factory function to create an embedding provider instance.

    Args:
        provider: Embedding provider name ("local", "ollama")
        **kwargs: Provider-specific configuration

    Returns:
        BaseEmbedding implementation instance

    Raises:
        ValueError: If provider is unknown
    """
    if provider == "local":
        from .embeddings import SentenceTransformerEmbedding

        return SentenceTransformerEmbedding(**kwargs)
    elif provider == "ollama":
        from .embeddings import OllamaEmbedding

        return OllamaEmbedding(**kwargs)
    else:
        raise ValueError(f"Unknown embedding provider: {provider}")


def create_vectorstore(**kwargs) -> BaseVectorStore:
    """Factory function to create a vector store instance.

    Args:
        **kwargs: Vector store configuration (e.g. persist_dir)

    Returns:
        BaseVectorStore implementation instance (ChromaDB)
    """
    from .vectorstore import ChromaVectorStore

    return ChromaVectorStore(**kwargs)
