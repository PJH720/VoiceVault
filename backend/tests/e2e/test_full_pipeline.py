"""E2E pipeline smoke test — full happy path verification.

Simulates a short recording flowing through the entire VoiceVault pipeline:
  Recording → WebSocket Audio → STT → Summarization → Classification
  → RAG Embedding → RAG Search → Obsidian Export

All external providers (STT, LLM, Embedding) are mocked.
Database (SQLite file-based) and orchestrator logic run for real.

See: https://github.com/PJH720/VoiceVault/issues/32
"""

from pathlib import Path

import pytest
from starlette.testclient import TestClient

from src.api.websocket import _BYTES_PER_MINUTE


@pytest.mark.e2e
def test_full_happy_path_pipeline(
    e2e_client: TestClient,
    e2e_pipeline: dict,
    fake_vectorstore,
):
    """Full pipeline: record → transcribe → summarize → classify → embed → RAG → export."""
    client = e2e_client

    # ── Setup: Seed a "lecture" template in the DB ──
    resp = client.post(
        "/api/v1/templates",
        json={
            "name": "lecture",
            "display_name": "Lecture Note",
            "triggers": ["lecture", "class", "AI", "LangChain"],
            "output_format": "markdown",
            "fields": [
                {"name": "summary", "type": "text"},
                {"name": "key_concepts", "type": "list"},
            ],
            "icon": "📚",
            "priority": 10,
        },
    )
    assert resp.status_code == 201, f"Template creation failed: {resp.text}"

    # ══════════════════════════════════════════════════════════════════════
    # Step 1: Start recording — POST /api/v1/recordings
    # ══════════════════════════════════════════════════════════════════════
    resp = client.post("/api/v1/recordings", json={"title": "E2E Test Lecture"})
    assert resp.status_code == 200
    recording_id = resp.json()["id"]
    assert resp.json()["status"] == "active"

    # ══════════════════════════════════════════════════════════════════════
    # Steps 2–3: WebSocket audio streaming + real-time transcription
    # ══════════════════════════════════════════════════════════════════════
    with client.websocket_connect(f"/ws/transcribe?recording_id={recording_id}") as ws:
        # Verify connection confirmation
        connected_msg = ws.receive_json()
        assert connected_msg["type"] == "connected"
        assert connected_msg["data"]["recording_id"] == recording_id

        # Send 1 minute of PCM audio to cross the minute boundary
        one_minute_pcm = b"\x00\x80" * (_BYTES_PER_MINUTE // 2)
        ws.send_bytes(one_minute_pcm)
        transcript_msg = ws.receive_json()
        assert transcript_msg["type"] == "transcript"
        assert transcript_msg["data"]["text"] != ""

        # Send a small follow-up chunk (partial second minute)
        ws.send_bytes(b"\x00\x80" * 1000)
        followup_msg = ws.receive_json()
        assert followup_msg["type"] == "transcript"

    # ── WebSocket closed ──
    # Starlette's TestClient cancels the ASGI handler task on disconnect,
    # so the handler's cleanup code (flush + stop_session) never runs.
    # We use the REST stop endpoint to explicitly trigger finalization:
    #   drain queue → summarize → embed → stop_recording → classify
    resp = client.patch(f"/api/v1/recordings/{recording_id}/stop")
    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"

    # ══════════════════════════════════════════════════════════════════════
    # Step 4: Verify 1-min auto-summaries exist in DB
    # ══════════════════════════════════════════════════════════════════════
    resp = client.get(f"/api/v1/recordings/{recording_id}/summaries")
    assert resp.status_code == 200
    summaries = resp.json()
    assert len(summaries) >= 1, f"Expected summaries, got: {summaries}"
    assert summaries[0]["summary_text"] != ""
    assert len(summaries[0]["keywords"]) > 0

    # ══════════════════════════════════════════════════════════════════════
    # Step 5: Verify recording is completed
    # ══════════════════════════════════════════════════════════════════════
    resp = client.get(f"/api/v1/recordings/{recording_id}")
    assert resp.status_code == 200
    recording = resp.json()
    assert recording["status"] == "completed"

    # ══════════════════════════════════════════════════════════════════════
    # Step 6: Verify auto-classification
    # ══════════════════════════════════════════════════════════════════════
    resp = client.get(f"/api/v1/recordings/{recording_id}/classifications")
    assert resp.status_code == 200
    classifications = resp.json()
    assert len(classifications) >= 1, f"Expected classification, got: {classifications}"
    assert classifications[0]["template_name"] == "lecture"
    assert classifications[0]["confidence"] > 0

    # ══════════════════════════════════════════════════════════════════════
    # Step 7: Verify RAG embedding (vectors stored in FakeVectorStore)
    # ══════════════════════════════════════════════════════════════════════
    assert len(fake_vectorstore._store) >= 1, (
        f"Expected vectors in store, got: {list(fake_vectorstore._store.keys())}"
    )
    # Verify doc IDs follow the expected format
    for doc_id in fake_vectorstore._store:
        assert doc_id.startswith(f"summary-{recording_id}-")

    # ══════════════════════════════════════════════════════════════════════
    # Step 8: RAG search — POST /api/v1/rag/query
    # ══════════════════════════════════════════════════════════════════════
    resp = client.post(
        "/api/v1/rag/query",
        json={"query": "LangChain Agent 설계 패턴"},
    )
    assert resp.status_code == 200
    rag_result = resp.json()
    assert rag_result["answer"] != ""
    assert len(rag_result["sources"]) >= 1
    assert rag_result["sources"][0]["recording_id"] == recording_id
    assert rag_result["query_time_ms"] >= 0

    # ══════════════════════════════════════════════════════════════════════
    # Step 9: Obsidian export — POST /api/v1/recordings/{id}/export
    # ══════════════════════════════════════════════════════════════════════
    resp = client.post(f"/api/v1/recordings/{recording_id}/export")
    assert resp.status_code == 200
    export = resp.json()
    assert export["markdown_content"] != ""
    assert export["frontmatter"] is not None
    assert "file_path" in export

    # Verify the export file was actually written to disk
    export_file = Path(export["file_path"])
    assert export_file.exists(), f"Export file not found: {export_file}"
    assert export_file.read_text(encoding="utf-8") == export["markdown_content"]
