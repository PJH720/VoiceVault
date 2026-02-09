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

    # -- summaries --

    def list_summaries(self, recording_id: int) -> list[dict]:
        resp = self._client.get(f"/api/v1/recordings/{recording_id}/summaries")
        resp.raise_for_status()
        return resp.json()


@st.cache_resource
def get_api_client() -> APIClient:
    """Return a cached APIClient singleton."""
    return APIClient(base_url=st.session_state.get("api_base_url", "http://localhost:8000"))
