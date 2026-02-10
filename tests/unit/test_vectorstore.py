"""Unit tests for ChromaDB vector store."""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from src.services.rag.base import BaseVectorStore
from src.services.rag.vectorstore import COLLECTION_NAME, ChromaVectorStore

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mock_settings(**overrides):
    """Return a fake Settings object with sensible defaults."""
    defaults = {
        "chroma_persist_dir": "/tmp/test_chroma_db",
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_collection():
    """Return a mock ChromaDB collection."""
    collection = MagicMock()
    collection.count.return_value = 0
    collection.query.return_value = {
        "ids": [["doc-1", "doc-2"]],
        "documents": [["text 1", "text 2"]],
        "metadatas": [[{"key": "val1"}, {"key": "val2"}]],
        "distances": [[0.1, 0.3]],
    }
    return collection


@pytest.fixture
def mock_chroma_client(mock_collection):
    """Return a mock ChromaDB PersistentClient."""
    client = MagicMock()
    client.get_or_create_collection.return_value = mock_collection
    return client


@pytest.fixture
def vectorstore(mock_chroma_client):
    """Create a ChromaVectorStore with mocked ChromaDB client."""
    with patch(
        "src.services.rag.vectorstore.get_settings",
        return_value=_mock_settings(),
    ):
        with patch(
            "src.services.rag.vectorstore.chromadb.PersistentClient",
            return_value=mock_chroma_client,
        ):
            instance = ChromaVectorStore()
    return instance


# ---------------------------------------------------------------------------
# TestChromaVectorStoreInit
# ---------------------------------------------------------------------------


class TestChromaVectorStoreInit:
    """Constructor / initialization tests."""

    def test_creates_collection_with_cosine_metric(self, mock_chroma_client, vectorstore):
        mock_chroma_client.get_or_create_collection.assert_called_once_with(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )

    def test_uses_settings_persist_dir(self):
        settings = _mock_settings(chroma_persist_dir="/custom/path")
        with patch(
            "src.services.rag.vectorstore.get_settings",
            return_value=settings,
        ):
            with patch("src.services.rag.vectorstore.chromadb.PersistentClient") as mock_cls:
                mock_cls.return_value.get_or_create_collection.return_value = MagicMock(
                    count=MagicMock(return_value=0)
                )
                ChromaVectorStore()

        mock_cls.assert_called_once_with(path="/custom/path")

    def test_explicit_persist_dir_overrides_settings(self):
        settings = _mock_settings()
        with patch(
            "src.services.rag.vectorstore.get_settings",
            return_value=settings,
        ):
            with patch("src.services.rag.vectorstore.chromadb.PersistentClient") as mock_cls:
                mock_cls.return_value.get_or_create_collection.return_value = MagicMock(
                    count=MagicMock(return_value=0)
                )
                ChromaVectorStore(persist_dir="/override/path")

        mock_cls.assert_called_once_with(path="/override/path")

    def test_implements_base_interface(self, vectorstore):
        assert isinstance(vectorstore, BaseVectorStore)


# ---------------------------------------------------------------------------
# TestAdd
# ---------------------------------------------------------------------------


class TestAdd:
    """Tests for ``add()``."""

    async def test_calls_upsert_with_correct_args(self, vectorstore, mock_collection):
        await vectorstore.add(
            doc_id="doc-1",
            text="hello world",
            embedding=[0.1, 0.2, 0.3],
            metadata={"recording_id": 1, "minute_index": 0},
        )

        mock_collection.upsert.assert_called_once_with(
            ids=["doc-1"],
            documents=["hello world"],
            embeddings=[[0.1, 0.2, 0.3]],
            metadatas=[{"recording_id": 1, "minute_index": 0}],
        )

    async def test_upsert_overwrites_existing(self, vectorstore, mock_collection):
        """Verify upsert is used (not add), so duplicates are updated."""
        await vectorstore.add("doc-1", "v1", [0.1], {})
        await vectorstore.add("doc-1", "v2", [0.2], {})

        assert mock_collection.upsert.call_count == 2


# ---------------------------------------------------------------------------
# TestSearch
# ---------------------------------------------------------------------------


class TestSearch:
    """Tests for ``search()``."""

    async def test_returns_formatted_results(self, vectorstore, mock_collection):
        results = await vectorstore.search(embedding=[0.1, 0.2], top_k=2)

        assert len(results) == 2
        assert results[0]["id"] == "doc-1"
        assert results[0]["text"] == "text 1"
        assert results[0]["metadata"] == {"key": "val1"}
        assert results[0]["distance"] == 0.1

    async def test_passes_top_k(self, vectorstore, mock_collection):
        mock_collection.query.return_value = {
            "ids": [[]],
            "documents": [[]],
            "metadatas": [[]],
            "distances": [[]],
        }

        await vectorstore.search(embedding=[0.1], top_k=10)

        call_kwargs = mock_collection.query.call_args.kwargs
        assert call_kwargs["n_results"] == 10

    async def test_passes_where_filter(self, vectorstore, mock_collection):
        mock_collection.query.return_value = {
            "ids": [[]],
            "documents": [[]],
            "metadatas": [[]],
            "distances": [[]],
        }

        where = {"recording_id": 42}
        await vectorstore.search(embedding=[0.1], where=where)

        call_kwargs = mock_collection.query.call_args.kwargs
        assert call_kwargs["where"] == {"recording_id": 42}

    async def test_no_where_omits_filter(self, vectorstore, mock_collection):
        mock_collection.query.return_value = {
            "ids": [[]],
            "documents": [[]],
            "metadatas": [[]],
            "distances": [[]],
        }

        await vectorstore.search(embedding=[0.1])

        call_kwargs = mock_collection.query.call_args.kwargs
        assert "where" not in call_kwargs

    async def test_empty_results_returns_empty_list(self, vectorstore, mock_collection):
        mock_collection.query.return_value = {
            "ids": [[]],
            "documents": [[]],
            "metadatas": [[]],
            "distances": [[]],
        }

        results = await vectorstore.search(embedding=[0.1])

        assert results == []


# ---------------------------------------------------------------------------
# TestSearchEmptyResults
# ---------------------------------------------------------------------------


class TestSearchEmptyResults:
    """Edge cases where ChromaDB returns empty or unusual results."""

    async def test_none_response_returns_empty(self, vectorstore, mock_collection):
        """ChromaDB returning None should yield an empty list."""
        mock_collection.query.return_value = None

        results = await vectorstore.search(embedding=[0.1, 0.2])

        assert results == []

    async def test_missing_ids_key_returns_empty(self, vectorstore, mock_collection):
        """Response dict without an 'ids' key should yield an empty list."""
        mock_collection.query.return_value = {}

        results = await vectorstore.search(embedding=[0.1, 0.2])

        assert results == []

    async def test_empty_outer_ids_list_returns_empty(self, vectorstore, mock_collection):
        """ids=[] (no query groups at all) should yield an empty list."""
        mock_collection.query.return_value = {
            "ids": [],
            "documents": [],
            "metadatas": [],
            "distances": [],
        }

        results = await vectorstore.search(embedding=[0.1, 0.2])

        assert results == []

    async def test_where_filter_matches_nothing(self, vectorstore, mock_collection):
        """A where filter that matches no documents returns an empty list."""
        mock_collection.query.return_value = {
            "ids": [[]],
            "documents": [[]],
            "metadatas": [[]],
            "distances": [[]],
        }

        results = await vectorstore.search(
            embedding=[0.1, 0.2],
            where={"recording_id": 99999},
        )

        assert results == []
        call_kwargs = mock_collection.query.call_args.kwargs
        assert call_kwargs["where"] == {"recording_id": 99999}

    async def test_missing_documents_key_uses_fallback(self, vectorstore, mock_collection):
        """If 'documents' key is absent, text should default to empty string."""
        mock_collection.query.return_value = {
            "ids": [["doc-1"]],
            "metadatas": [[{"key": "val"}]],
            "distances": [[0.05]],
        }

        results = await vectorstore.search(embedding=[0.1])

        assert len(results) == 1
        assert results[0]["id"] == "doc-1"
        assert results[0]["text"] == ""
        assert results[0]["metadata"] == {"key": "val"}
        assert results[0]["distance"] == 0.05

    async def test_missing_metadatas_key_uses_fallback(self, vectorstore, mock_collection):
        """If 'metadatas' key is absent, metadata should default to empty dict."""
        mock_collection.query.return_value = {
            "ids": [["doc-1"]],
            "documents": [["some text"]],
            "distances": [[0.2]],
        }

        results = await vectorstore.search(embedding=[0.1])

        assert len(results) == 1
        assert results[0]["text"] == "some text"
        assert results[0]["metadata"] == {}

    async def test_missing_distances_key_uses_fallback(self, vectorstore, mock_collection):
        """If 'distances' key is absent, distance should default to 0.0."""
        mock_collection.query.return_value = {
            "ids": [["doc-1"]],
            "documents": [["some text"]],
            "metadatas": [[{"key": "val"}]],
        }

        results = await vectorstore.search(embedding=[0.1])

        assert len(results) == 1
        assert results[0]["distance"] == 0.0

    async def test_shorter_documents_than_ids_uses_fallback(self, vectorstore, mock_collection):
        """If documents list is shorter than ids, extras get empty strings."""
        mock_collection.query.return_value = {
            "ids": [["doc-1", "doc-2"]],
            "documents": [["only first"]],
            "metadatas": [[{"a": 1}, {"b": 2}]],
            "distances": [[0.1, 0.4]],
        }

        results = await vectorstore.search(embedding=[0.1])

        assert len(results) == 2
        assert results[0]["text"] == "only first"
        assert results[1]["text"] == ""

    async def test_search_after_delete_returns_empty(self, vectorstore, mock_collection):
        """Simulates searching after the only document was deleted."""
        mock_collection.query.return_value = {
            "ids": [[]],
            "documents": [[]],
            "metadatas": [[]],
            "distances": [[]],
        }

        # Delete then search
        await vectorstore.delete("doc-1")
        results = await vectorstore.search(embedding=[0.1, 0.2])

        assert results == []
        mock_collection.delete.assert_called_once_with(ids=["doc-1"])

    async def test_high_top_k_on_empty_collection(self, vectorstore, mock_collection):
        """Requesting many results from an empty collection returns nothing."""
        mock_collection.query.return_value = {
            "ids": [[]],
            "documents": [[]],
            "metadatas": [[]],
            "distances": [[]],
        }

        results = await vectorstore.search(embedding=[0.1], top_k=1000)

        assert results == []
        call_kwargs = mock_collection.query.call_args.kwargs
        assert call_kwargs["n_results"] == 1000


# ---------------------------------------------------------------------------
# TestDelete
# ---------------------------------------------------------------------------


class TestDelete:
    """Tests for ``delete()``."""

    async def test_calls_collection_delete(self, vectorstore, mock_collection):
        await vectorstore.delete("doc-1")

        mock_collection.delete.assert_called_once_with(ids=["doc-1"])


# ---------------------------------------------------------------------------
# TestCount
# ---------------------------------------------------------------------------


class TestCount:
    """Tests for ``count()``."""

    async def test_returns_collection_count(self, vectorstore, mock_collection):
        mock_collection.count.return_value = 42

        result = await vectorstore.count()

        assert result == 42

    async def test_returns_zero_for_empty_collection(self, vectorstore, mock_collection):
        mock_collection.count.return_value = 0

        result = await vectorstore.count()

        assert result == 0


# ---------------------------------------------------------------------------
# TestCreateVectorstore factory
# ---------------------------------------------------------------------------


class TestCreateVectorstore:
    """Tests for the create_vectorstore factory function."""

    def test_creates_chroma_vectorstore(self):
        with patch(
            "src.services.rag.vectorstore.get_settings",
            return_value=_mock_settings(),
        ):
            with patch("src.services.rag.vectorstore.chromadb.PersistentClient") as mock_cls:
                mock_cls.return_value.get_or_create_collection.return_value = MagicMock(
                    count=MagicMock(return_value=0)
                )
                from src.services.rag import create_vectorstore

                instance = create_vectorstore()

        assert isinstance(instance, ChromaVectorStore)
