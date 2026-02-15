"""Unit tests for the APIClient RAG, export, and template methods.

Validates that the Streamlit-side APIClient correctly serialises request
parameters, calls the right endpoints, propagates errors, and omits
optional filters when they are None or empty.
"""

from unittest.mock import MagicMock, patch

import pytest

from src.ui.api_client import APIClient


@pytest.fixture
def client():
    """Create an APIClient with a mocked httpx.Client."""
    with patch("src.ui.api_client.httpx.Client") as mock_cls:
        mock_http = MagicMock()
        mock_cls.return_value = mock_http
        api = APIClient(base_url="http://test:8000")
        api._mock_http = mock_http  # expose for assertions
        yield api


class TestRagQuery:
    """Verify APIClient.rag_query() request construction and response handling."""

    def test_basic_query(self, client):
        """Minimal query sends correct JSON body and returns the answer."""
        resp = MagicMock()
        resp.json.return_value = {
            "answer": "Test answer",
            "sources": [],
            "model_used": "test",
            "query_time_ms": 42,
        }
        client._mock_http.post.return_value = resp

        result = client.rag_query(query="test question")

        client._mock_http.post.assert_called_once_with(
            "/api/v1/rag/query",
            json={"query": "test question", "top_k": 5, "min_similarity": 0.3},
        )
        resp.raise_for_status.assert_called_once()
        assert result["answer"] == "Test answer"

    def test_query_with_all_filters(self, client):
        """All optional filters are included in the request body when set."""
        resp = MagicMock()
        resp.json.return_value = {"answer": "filtered", "sources": []}
        client._mock_http.post.return_value = resp

        client.rag_query(
            query="q",
            top_k=10,
            min_similarity=0.5,
            date_from="2026-01-01",
            date_to="2026-02-01",
            category="lecture",
            keywords=["AI", "RAG"],
        )

        call_body = client._mock_http.post.call_args[1]["json"]
        assert call_body["query"] == "q"
        assert call_body["top_k"] == 10
        assert call_body["min_similarity"] == 0.5
        assert call_body["date_from"] == "2026-01-01"
        assert call_body["date_to"] == "2026-02-01"
        assert call_body["category"] == "lecture"
        assert call_body["keywords"] == ["AI", "RAG"]

    def test_optional_filters_excluded_when_none(self, client):
        """None-valued optional filters are omitted from the JSON body."""
        resp = MagicMock()
        resp.json.return_value = {"answer": "", "sources": []}
        client._mock_http.post.return_value = resp

        client.rag_query(query="q")

        call_body = client._mock_http.post.call_args[1]["json"]
        assert "date_from" not in call_body
        assert "date_to" not in call_body
        assert "category" not in call_body
        assert "keywords" not in call_body

    def test_error_propagation(self, client):
        """HTTP errors from raise_for_status propagate to the caller."""
        resp = MagicMock()
        resp.raise_for_status.side_effect = Exception("500 Server Error")
        client._mock_http.post.return_value = resp

        with pytest.raises(Exception, match="500 Server Error"):
            client.rag_query(query="fail")


class TestRagSimilar:
    """Verify APIClient.rag_similar() request construction and response handling."""

    def test_basic_similar(self, client):
        """Default top_k=5 is sent and response is parsed correctly."""
        resp = MagicMock()
        resp.json.return_value = [
            {"recording_id": 2, "similarity": 0.85, "summary_text": "similar"}
        ]
        client._mock_http.get.return_value = resp

        result = client.rag_similar(recording_id=1)

        client._mock_http.get.assert_called_once_with(
            "/api/v1/rag/similar/1",
            params={"top_k": 5},
        )
        resp.raise_for_status.assert_called_once()
        assert len(result) == 1
        assert result[0]["recording_id"] == 2

    def test_custom_top_k(self, client):
        """Custom top_k value is forwarded as a query parameter."""
        resp = MagicMock()
        resp.json.return_value = []
        client._mock_http.get.return_value = resp

        client.rag_similar(recording_id=3, top_k=10)

        client._mock_http.get.assert_called_once_with(
            "/api/v1/rag/similar/3",
            params={"top_k": 10},
        )

    def test_error_propagation(self, client):
        """HTTP errors propagate to the caller."""
        resp = MagicMock()
        resp.raise_for_status.side_effect = Exception("404 Not Found")
        client._mock_http.get.return_value = resp

        with pytest.raises(Exception, match="404 Not Found"):
            client.rag_similar(recording_id=999)


class TestExportRecording:
    """Verify APIClient.export_recording() request construction and response handling."""

    def test_basic_export(self, client):
        """Default export sends Obsidian format without transcript."""
        resp = MagicMock()
        resp.json.return_value = {
            "file_path": "/exports/test.md",
            "markdown_content": "# Test",
            "frontmatter": {"title": "Test"},
        }
        client._mock_http.post.return_value = resp

        result = client.export_recording(recording_id=1)

        client._mock_http.post.assert_called_once_with(
            "/api/v1/recordings/1/export",
            json={"format": "obsidian", "include_transcript": False},
        )
        resp.raise_for_status.assert_called_once()
        assert result["file_path"] == "/exports/test.md"

    def test_export_with_all_options(self, client):
        """All optional export parameters are included when set."""
        resp = MagicMock()
        resp.json.return_value = {"file_path": "", "markdown_content": "", "frontmatter": {}}
        client._mock_http.post.return_value = resp

        client.export_recording(
            recording_id=2,
            format="markdown",
            include_transcript=True,
            vault_path="/my/vault",
        )

        call_body = client._mock_http.post.call_args[1]["json"]
        assert call_body["format"] == "markdown"
        assert call_body["include_transcript"] is True
        assert call_body["vault_path"] == "/my/vault"

    def test_vault_path_excluded_when_empty(self, client):
        """Empty vault_path string is omitted from the request body."""
        resp = MagicMock()
        resp.json.return_value = {"file_path": "", "markdown_content": "", "frontmatter": {}}
        client._mock_http.post.return_value = resp

        client.export_recording(recording_id=1, vault_path="")

        call_body = client._mock_http.post.call_args[1]["json"]
        assert "vault_path" not in call_body

    def test_error_propagation(self, client):
        """HTTP errors propagate to the caller."""
        resp = MagicMock()
        resp.raise_for_status.side_effect = Exception("500 Server Error")
        client._mock_http.post.return_value = resp

        with pytest.raises(Exception, match="500 Server Error"):
            client.export_recording(recording_id=1)


class TestListTemplates:
    """Verify APIClient.list_templates() request construction and response handling."""

    def test_list_templates(self, client):
        """GET /templates returns the template list."""
        resp = MagicMock()
        resp.json.return_value = [
            {"id": 1, "name": "lecture", "display_name": "Lecture Note"},
            {"id": 2, "name": "meeting", "display_name": "Meeting Notes"},
        ]
        client._mock_http.get.return_value = resp

        result = client.list_templates()

        client._mock_http.get.assert_called_once_with("/api/v1/templates")
        resp.raise_for_status.assert_called_once()
        assert len(result) == 2
        assert result[0]["name"] == "lecture"

    def test_error_propagation(self, client):
        """HTTP errors propagate to the caller."""
        resp = MagicMock()
        resp.raise_for_status.side_effect = Exception("503 Service Unavailable")
        client._mock_http.get.return_value = resp

        with pytest.raises(Exception, match="503 Service Unavailable"):
            client.list_templates()
