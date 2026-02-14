"""
Synchronous HTTP client for the VoiceVault backend API.

Uses ``httpx.Client`` (sync) because Streamlit scripts run synchronously.
"""

import logging

import httpx
import streamlit as st

logger = logging.getLogger(__name__)


class APIError(Exception):
    """User-friendly API error with categorized message.

    Categories: "connection", "timeout", "http", "network", "unknown".
    Used by the UI to display appropriate error messages.
    """

    def __init__(self, message: str, category: str = "unknown") -> None:
        self.message = message
        self.category = category
        super().__init__(message)


class APIClient:
    """Thin synchronous wrapper around httpx for calling the FastAPI backend.

    Uses synchronous HTTP because Streamlit scripts run on a single thread.
    All methods return parsed JSON dicts or raise ``APIError`` with
    user-friendly messages for display in the UI.
    """

    def __init__(self, base_url: str = "http://localhost:8000") -> None:
        """Initialize the HTTP client.

        Args:
            base_url: Base URL of the VoiceVault FastAPI backend.
        """
        self._base_url = base_url.rstrip("/")
        self._client = httpx.Client(base_url=self._base_url, timeout=30.0)

    def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        """Execute an HTTP request with user-friendly error handling.

        Args:
            method: HTTP method name ("get", "post", "patch", "delete").
            path: API endpoint path (e.g. "/api/v1/recordings").
            **kwargs: Passed through to httpx (json, params, timeout, etc.).

        Returns:
            The httpx Response object with a successful status code.

        Raises:
            APIError: On connection, timeout, HTTP status, or network errors.
        """
        try:
            resp = getattr(self._client, method)(path, **kwargs)
            resp.raise_for_status()
            return resp
        except httpx.ConnectError:
            raise APIError(
                "Backend server is not running. "
                "Start it with: `uvicorn src.api.app:app --reload --port 8000`",
                category="connection",
            ) from None
        except httpx.TimeoutException:
            raise APIError(
                "Request timed out. The server may be overloaded.",
                category="timeout",
            ) from None
        except httpx.HTTPStatusError as exc:
            try:
                detail = exc.response.json().get("detail", exc.response.text)
            except Exception:
                detail = exc.response.text or str(exc)
            raise APIError(str(detail), category="http") from None
        except httpx.HTTPError as exc:
            raise APIError(f"Network error: {exc}", category="network") from None

    # -- health --

    def health_check(self) -> dict:
        return self._request("get", "/health").json()

    def check_connection(self) -> tuple[bool, str]:
        """Check if the backend is reachable. Returns (ok, message)."""
        try:
            self.health_check()
            return True, "Connected"
        except APIError as exc:
            return False, exc.message

    # -- recordings --

    def create_recording(self, title: str | None = None, context: str | None = None) -> dict:
        body: dict = {}
        if title:
            body["title"] = title
        if context:
            body["context"] = context
        return self._request("post", "/api/v1/recordings", json=body or None).json()

    def list_recordings(
        self,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict]:
        params: dict = {"limit": limit, "offset": offset}
        if status:
            params["status"] = status
        return self._request("get", "/api/v1/recordings", params=params).json()

    def get_recording(self, recording_id: int) -> dict:
        return self._request("get", f"/api/v1/recordings/{recording_id}").json()

    def stop_recording(self, recording_id: int) -> dict:
        return self._request("patch", f"/api/v1/recordings/{recording_id}/stop").json()

    def sync_recordings(self) -> dict:
        return self._request("post", "/api/v1/recordings/sync").json()

    def check_consistency(self) -> dict:
        return self._request("get", "/api/v1/recordings/consistency").json()

    def delete_recording(self, recording_id: int) -> dict:
        return self._request("delete", f"/api/v1/recordings/{recording_id}").json()

    def consistency_cleanup(
        self,
        action: str,
        record_ids: list[int] | None = None,
        file_paths: list[str] | None = None,
    ) -> dict:
        body = {
            "action": action,
            "record_ids": record_ids or [],
            "file_paths": file_paths or [],
        }
        return self._request("post", "/api/v1/recordings/consistency/cleanup", json=body).json()

    def process_recording(self, recording_id: int) -> dict:
        return self._request(
            "post", f"/api/v1/recordings/{recording_id}/process", timeout=300.0
        ).json()

    # -- audio --

    def download_audio(self, recording_id: int) -> bytes | None:
        """Fetch raw audio bytes for a recording. Returns None on error."""
        try:
            resp = self._request("get", f"/api/v1/recordings/{recording_id}/audio")
            return resp.content
        except APIError:
            return None

    # -- summaries --

    def list_summaries(self, recording_id: int) -> list[dict]:
        return self._request("get", f"/api/v1/recordings/{recording_id}/summaries").json()

    def list_hour_summaries(self, recording_id: int) -> list[dict]:
        return self._request("get", f"/api/v1/recordings/{recording_id}/hour-summaries").json()

    def extract_range(self, recording_id: int, start_minute: int, end_minute: int) -> dict:
        """Cross-boundary range extraction and re-summarization."""
        return self._request(
            "post",
            f"/api/v1/recordings/{recording_id}/extract",
            json={"start_minute": start_minute, "end_minute": end_minute},
            timeout=120.0,
        ).json()

    # -- transcripts --

    def list_transcripts(self, recording_id: int) -> list[dict]:
        return self._request("get", f"/api/v1/recordings/{recording_id}/transcripts").json()

    # -- classifications --

    def list_classifications(self, recording_id: int) -> list[dict]:
        return self._request("get", f"/api/v1/recordings/{recording_id}/classifications").json()

    # -- RAG --

    def rag_query(
        self,
        query: str,
        top_k: int = 5,
        min_similarity: float = 0.3,
        date_from: str | None = None,
        date_to: str | None = None,
        category: str | None = None,
        keywords: list[str] | None = None,
    ) -> dict:
        """Send a natural-language RAG query with optional filters."""
        body: dict = {
            "query": query,
            "top_k": top_k,
            "min_similarity": min_similarity,
        }
        if date_from is not None:
            body["date_from"] = date_from
        if date_to is not None:
            body["date_to"] = date_to
        if category is not None:
            body["category"] = category
        if keywords is not None:
            body["keywords"] = keywords
        return self._request("post", "/api/v1/rag/query", json=body).json()

    def reindex_rag(self) -> dict:
        """Trigger a full RAG re-indexing of all recordings."""
        return self._request("post", "/api/v1/rag/reindex", timeout=300.0).json()

    def rag_similar(
        self,
        recording_id: int,
        top_k: int = 5,
    ) -> list[dict]:
        return self._request(
            "get",
            f"/api/v1/rag/similar/{recording_id}",
            params={"top_k": top_k},
        ).json()

    # -- export --

    def export_recording(
        self,
        recording_id: int,
        format: str = "obsidian",
        include_transcript: bool = False,
        vault_path: str | None = None,
    ) -> dict:
        """Export a recording as Obsidian-compatible Markdown."""
        body: dict = {
            "format": format,
            "include_transcript": include_transcript,
        }
        if vault_path:
            body["vault_path"] = vault_path
        return self._request(
            "post",
            f"/api/v1/recordings/{recording_id}/export",
            json=body,
        ).json()

    # -- templates --

    def list_templates(self) -> list[dict]:
        return self._request("get", "/api/v1/templates").json()

    def create_template(self, data: dict) -> dict:
        return self._request("post", "/api/v1/templates", json=data).json()

    def update_template(self, template_id: int, data: dict) -> dict:
        return self._request("patch", f"/api/v1/templates/{template_id}", json=data).json()

    def delete_template(self, template_id: int) -> dict:
        return self._request("delete", f"/api/v1/templates/{template_id}").json()


@st.cache_resource
def get_api_client(base_url: str = "http://localhost:8000") -> APIClient:
    """Return a cached APIClient, keyed by base_url.

    Uses Streamlit's ``cache_resource`` to persist the client across reruns.
    When the base URL changes (e.g. user updates sidebar), a new client
    is created automatically because the cache key includes the parameter.
    """
    return APIClient(base_url=base_url)
