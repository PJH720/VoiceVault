/**
 * Typed environment variable access with build-time validation.
 *
 * NEXT_PUBLIC_* vars are inlined at build time — if a required var is
 * missing, the build should fail fast with a clear error message rather
 * than producing a broken bundle that silently hits the wrong URL.
 */

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/** REST API base URL (e.g. "http://localhost:8000/api/v1") */
export const API_BASE_URL = stripTrailingSlash(
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "",
);

/** WebSocket base URL (e.g. "ws://localhost:8000") */
export const WS_URL = stripTrailingSlash(
  process.env.NEXT_PUBLIC_WS_URL ?? "",
);

/** WebSocket endpoint for real-time transcription */
export function wsTranscribeUrl(recordingId: number): string {
  return `${WS_URL}/ws/transcribe?recording_id=${recordingId}`;
}
