"""
Abstract base classes for RAG embedding and vector store providers.

All embedding and vector store implementations must implement these interfaces,
enabling provider-agnostic business logic in the service layer.
"""

from abc import ABC, abstractmethod


class BaseEmbedding(ABC):
    """Interface that every embedding provider must implement."""

    @abstractmethod
    async def embed(self, text: str) -> list[float]:
        """Generate an embedding vector for a single text.

        Args:
            text: The text to embed.

        Returns:
            A list of floats representing the embedding vector.
        """

    @abstractmethod
    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embedding vectors for multiple texts.

        Args:
            texts: A list of texts to embed.

        Returns:
            A list of embedding vectors, one per input text.
        """

    @abstractmethod
    def dimension(self) -> int:
        """Return the dimensionality of the embedding vectors.

        Returns:
            The number of dimensions in each embedding vector.
        """


class BaseVectorStore(ABC):
    """Interface that every vector store must implement."""

    @abstractmethod
    async def add(
        self,
        doc_id: str,
        text: str,
        embedding: list[float],
        metadata: dict,
    ) -> None:
        """Add or update a document in the vector store.

        Args:
            doc_id: Unique identifier for the document.
            text: The document text.
            embedding: Pre-computed embedding vector.
            metadata: Key-value metadata to store alongside the document.
        """

    @abstractmethod
    async def search(
        self,
        embedding: list[float],
        top_k: int = 5,
        where: dict | None = None,
    ) -> list[dict]:
        """Search for similar documents by embedding vector.

        Args:
            embedding: The query embedding vector.
            top_k: Maximum number of results to return.
            where: Optional metadata filter (ChromaDB where clause).

        Returns:
            A list of dicts with keys: id, text, metadata, distance.
        """

    @abstractmethod
    async def delete(self, doc_id: str) -> None:
        """Delete a document from the vector store.

        Args:
            doc_id: The document ID to delete.
        """

    @abstractmethod
    async def count(self) -> int:
        """Return the total number of documents in the store.

        Returns:
            The document count.
        """
