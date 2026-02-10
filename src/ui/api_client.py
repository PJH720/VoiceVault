"""
Synchronous HTTP client for the VoiceVault backend API.

Uses ``httpx.Client`` (sync) because Streamlit scripts run synchronously.
"""

import logging

import httpx
import streamlit as st

logger = logging.getLogger(__name__)


class APIClient:
    """Thin wrapper around httpx for calling the FastAPI backend."""

    def __init__(self, base_url: str = "http://localhost:8000") -> None:
        self._base_url = base_url.rstrip("/")
        self._client = httpx.Client(base_url=self._base_url, timeout=30.0)

    # -- health --

    def health_check(self) -> dict:
        resp = self._client.get("/health")
        resp.raise_for_status()
        return resp.json()

    # -- recordings --

    def create_recording(self, title: str | None = None) -> dict:
        body = {"title": title} if title else None
        resp = self._client.post("/api/v1/recordings", json=body)
        resp.raise_for_status()
        return resp.json()

    def list_recordings(
        self,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict]:
        params: dict = {"limit": limit, "offset": offset}
        if status:
            params["status"] = status
        resp = self._client.get("/api/v1/recordings", params=params)
        resp.raise_for_status()
        return resp.json()

    def get_recording(self, recording_id: int) -> dict:
        resp = self._client.get(f"/api/v1/recordings/{recording_id}")
        resp.raise_for_status()
        return resp.json()

    def stop_recording(self, recording_id: int) -> dict:
        resp = self._client.patch(f"/api/v1/recordings/{recording_id}/stop")
        resp.raise_for_status()
        return resp.json()

    # -- audio --

    def download_audio(self, recording_id: int) -> bytes | None:
        """Fetch raw audio bytes for a recording. Returns None on error."""
        try:
            resp = self._client.get(f"/api/v1/recordings/{recording_id}/audio")
            resp.raise_for_status()
            return resp.content
        except httpx.HTTPStatusError:
            return None

    # -- summaries --

    def list_summaries(self, recording_id: int) -> list[dict]:
        resp = self._client.get(f"/api/v1/recordings/{recording_id}/summaries")
        resp.raise_for_status()
        return resp.json()

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
        resp = self._client.post("/api/v1/rag/query", json=body)
        resp.raise_for_status()
        return resp.json()

    def rag_similar(
        self,
        recording_id: int,
        top_k: int = 5,
    ) -> list[dict]:
        resp = self._client.get(
            f"/api/v1/rag/similar/{recording_id}",
            params={"top_k": top_k},
        )
        resp.raise_for_status()
        return resp.json()

    # -- export --

    def export_recording(
        self,
        recording_id: int,
        format: str = "obsidian",
        include_transcript: bool = False,
        vault_path: str | None = None,
    ) -> dict:
        body: dict = {
            "format": format,
            "include_transcript": include_transcript,
        }
        if vault_path:
            body["vault_path"] = vault_path
        resp = self._client.post(
            f"/api/v1/recordings/{recording_id}/export",
            json=body,
        )
        resp.raise_for_status()
        return resp.json()

    # -- templates --

    def list_templates(self) -> list[dict]:
        resp = self._client.get("/api/v1/templates")
        resp.raise_for_status()
        return resp.json()

    def create_template(self, data: dict) -> dict:
        resp = self._client.post("/api/v1/templates", json=data)
        resp.raise_for_status()
        return resp.json()

    def update_template(self, template_id: int, data: dict) -> dict:
        resp = self._client.patch(f"/api/v1/templates/{template_id}", json=data)
        resp.raise_for_status()
        return resp.json()

    def delete_template(self, template_id: int) -> dict:
        resp = self._client.delete(f"/api/v1/templates/{template_id}")
        resp.raise_for_status()
        return resp.json()


@st.cache_resource
def get_api_client() -> APIClient:
    """Return a cached APIClient singleton."""
    return APIClient(base_url=st.session_state.get("api_base_url", "http://localhost:8000"))
