/**
 * TypeScript types for the VoiceVault WebSocket message protocol.
 *
 * Mirrors backend `WebSocketMessage` / `WebSocketMessageType` from
 * `backend/src/core/models.py`. The server sends JSON messages with a
 * discriminator `type` field; each variant carries a typed `data` payload.
 *
 * Client → Server: raw PCM16 bytes (binary frames, not JSON).
 */

// ---------------------------------------------------------------------------
// Message type discriminator
// ---------------------------------------------------------------------------

export type WsMessageType =
  | "connected"
  | "transcript"
  | "summary"
  | "status"
  | "error";

// ---------------------------------------------------------------------------
// Per-type data payloads
// ---------------------------------------------------------------------------

/** Initial handshake — confirms the server accepted the connection. */
export interface WsConnectedData {
  recording_id: number;
}

/** Real-time STT text segment from faster-whisper. */
export interface WsTranscriptData {
  text: string;
  confidence?: number;
  language?: string;
}

/** 1-minute summary produced by the orchestrator. */
export interface WsSummaryData {
  minute_index: number;
  summary_text: string;
  keywords?: string[];
  speakers?: string[];
  confidence?: number;
  model_used?: string;
}

/** Recording state change (e.g. processing → completed). */
export interface WsStatusData {
  status: string;
  detail?: string;
}

/** Error during transcription or summarization. */
export interface WsErrorData {
  detail: string;
}

// ---------------------------------------------------------------------------
// Discriminated union of all server→client messages
// ---------------------------------------------------------------------------

export type WsMessage =
  | { type: "connected"; data: WsConnectedData }
  | { type: "transcript"; data: WsTranscriptData }
  | { type: "summary"; data: WsSummaryData }
  | { type: "status"; data: WsStatusData }
  | { type: "error"; data: WsErrorData };

// ---------------------------------------------------------------------------
// Connection state
// ---------------------------------------------------------------------------

export type WsConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";
