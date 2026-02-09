"""
ChromaDB vector store implementation.

Wraps ChromaDB's ``PersistentClient`` for embedding storage and similarity
search. All synchronous ChromaDB operations are wrapped in
``asyncio.to_thread()`` to avoid blocking the event loop.
"""

import asyncio
import logging

import chromadb

from src.core.config import get_settings
from src.services.rag.base import BaseVectorStore

logger = logging.getLogger(__name__)

COLLECTION_NAME = "voicevault_summaries"


class ChromaVectorStore(BaseVectorStore):
    """ChromaDB-backed vector store with cosine similarity.

    Uses ``PersistentClient`` for durable storage under
    ``settings.chroma_persist_dir``. Collection is created on first access.
    """

    def __init__(self, persist_dir: str | None = None) -> None:
        settings = get_settings()
        self._persist_dir = persist_dir or settings.chroma_persist_dir
        self._client = chromadb.PersistentClient(path=self._persist_dir)
        self._collection = self._client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
        logger.info(
            "ChromaDB collection '%s' ready (%d docs) at %s",
            COLLECTION_NAME,
            self._collection.count(),
            self._persist_dir,
        )

    async def add(
        self,
        doc_id: str,
        text: str,
        embedding: list[float],
        metadata: dict,
    ) -> None:
        """Upsert a document into the ChromaDB collection."""
        await asyncio.to_thread(
            self._collection.upsert,
            ids=[doc_id],
            documents=[text],
            embeddings=[embedding],
            metadatas=[metadata],
        )

    async def search(
        self,
        embedding: list[float],
        top_k: int = 5,
        where: dict | None = None,
    ) -> list[dict]:
        """Query the collection for similar documents.

        Returns:
            A list of dicts with keys: id, text, metadata, distance.
        """
        kwargs: dict = {
            "query_embeddings": [embedding],
            "n_results": top_k,
        }
        if where:
            kwargs["where"] = where

        raw = await asyncio.to_thread(self._collection.query, **kwargs)

        results = []
        if raw and raw.get("ids"):
            ids = raw["ids"][0]
            documents = raw.get("documents", [[]])[0]
            metadatas = raw.get("metadatas", [[]])[0]
            distances = raw.get("distances", [[]])[0]

            for i, doc_id in enumerate(ids):
                results.append(
                    {
                        "id": doc_id,
                        "text": documents[i] if i < len(documents) else "",
                        "metadata": metadatas[i] if i < len(metadatas) else {},
                        "distance": distances[i] if i < len(distances) else 0.0,
                    }
                )

        return results

    async def delete(self, doc_id: str) -> None:
        """Delete a document by ID from the collection."""
        await asyncio.to_thread(self._collection.delete, ids=[doc_id])

    async def count(self) -> int:
        """Return the total number of documents in the collection."""
        return await asyncio.to_thread(self._collection.count)
