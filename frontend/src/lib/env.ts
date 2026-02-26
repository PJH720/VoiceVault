/**
 * Typed environment variable access with build-time validation.
 *
 * NEXT_PUBLIC_* vars are inlined at build time — if a required var is
 * missing, the build should fail fast with a clear error message rather
 * than producing a broken bundle that silently hits the wrong URL.
 */

// #region agent log
fetch("http://127.0.0.1:7246/ingest/34638976-2389-45ac-9e64-67cf3b5f9b44", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    runId: "pre-fix-2",
    hypothesisId: "H6_module-load",
    location: "src/lib/env.ts:module-top",
    message: "env module evaluated",
    data: {
      nodeEnv: process.env.NODE_ENV ?? "undefined",
      nextPublicKeys: Object.keys(process.env)
        .filter((k) => k.startsWith("NEXT_PUBLIC_"))
        .slice(0, 20),
    },
    timestamp: Date.now(),
  }),
}).catch(() => {});
// #endregion
function required(key: string, value: string | undefined): string {
  // #region agent log
  fetch("http://127.0.0.1:7246/ingest/34638976-2389-45ac-9e64-67cf3b5f9b44", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      runId: "pre-fix-1",
      hypothesisId: "H1_H3_H4",
      location: "src/lib/env.ts:required:entry",
      message: "required() called",
      data: {
        key,
        hasKeyInProcessEnv: Object.prototype.hasOwnProperty.call(process.env, key),
        valueType: typeof value,
        valueLength: typeof value === "string" ? value.length : -1,
        trimmedLength: typeof value === "string" ? value.trim().length : -1,
        cwd: typeof process.cwd === "function" ? process.cwd() : "unknown",
        nodeEnv: process.env.NODE_ENV ?? "undefined",
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  if (!value) {
    // #region agent log
    fetch("http://127.0.0.1:7246/ingest/34638976-2389-45ac-9e64-67cf3b5f9b44", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runId: "pre-fix-1",
        hypothesisId: "H2_H5",
        location: "src/lib/env.ts:required:missing-branch",
        message: "required() missing value branch",
        data: {
          key,
          hasKeyInProcessEnv: Object.prototype.hasOwnProperty.call(process.env, key),
          envSampleKeys: Object.keys(process.env)
            .filter((k) => k.startsWith("NEXT_PUBLIC_"))
            .slice(0, 10),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    throw new Error(
      `Missing required environment variable: ${key}\n` +
        `Copy frontend/.env.example to frontend/.env.local and set it.`,
    );
  }
  // #region agent log
  fetch("http://127.0.0.1:7246/ingest/34638976-2389-45ac-9e64-67cf3b5f9b44", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      runId: "pre-fix-1",
      hypothesisId: "H0_control",
      location: "src/lib/env.ts:required:success-branch",
      message: "required() returned value",
      data: {
        key,
        valueLength: value.length,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  return value;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/** REST API base URL (e.g. "http://localhost:8000/api/v1") */
export const API_BASE_URL = stripTrailingSlash(
  required("NEXT_PUBLIC_API_BASE_URL", process.env.NEXT_PUBLIC_API_BASE_URL),
);

/** WebSocket base URL (e.g. "ws://localhost:8000") */
export const WS_URL = stripTrailingSlash(
  required("NEXT_PUBLIC_WS_URL", process.env.NEXT_PUBLIC_WS_URL),
);

/** WebSocket endpoint for real-time transcription */
export function wsTranscribeUrl(recordingId: number): string {
  return `${WS_URL}/ws/transcribe?recording_id=${recordingId}`;
}
