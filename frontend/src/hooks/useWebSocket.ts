"use client";

/**
 * React hook that wraps `VoiceVaultWsClient` for the transcription WebSocket.
 *
 * Manages the client lifecycle (create → connect → disconnect on unmount),
 * syncs connection state to the Zustand recording store, and exposes typed
 * callbacks for each server message type.
 */

import { useCallback, useEffect, useRef, useInsertionEffect } from "react";

import { useRecordingStore } from "@/stores/recording";
import {
  VoiceVaultWsClient,
  type WsClientOptions,
} from "@/lib/websocket/ws-client";
import type {
  WsConnectionState,
  WsErrorData,
  WsMessage,
  WsSummaryData,
  WsTranscriptData,
} from "@/types/ws-messages";

// ---------------------------------------------------------------------------
// Hook options
// ---------------------------------------------------------------------------

export interface UseWebSocketOptions {
  /** Recording ID to connect to. `null` = don't connect. */
  recordingId: number | null;
  /** ISO language code (optional, e.g. "ko"). */
  language?: string;
  /** Auth token (optional, for WS_AUTH_ENABLED). */
  token?: string;
  /** Called on each real-time transcript segment. */
  onTranscript?: (data: WsTranscriptData) => void;
  /** Called on each 1-minute summary. */
  onSummary?: (data: WsSummaryData) => void;
  /** Called on server error messages. */
  onError?: (data: WsErrorData) => void;
  /** Called on any connection state change. */
  onStateChange?: (state: WsConnectionState) => void;
}

// ---------------------------------------------------------------------------
// Hook return
// ---------------------------------------------------------------------------

export interface UseWebSocketReturn {
  /** Current connection state (from Zustand store). */
  connectionState: WsConnectionState;
  /** Send a PCM16 audio chunk to the server. */
  sendAudio: (pcm16: ArrayBuffer) => void;
  /** Manually disconnect (also called on unmount). */
  disconnect: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const { recordingId, language, token } = options;

  // Keep callbacks in refs so they don't cause reconnects on change
  const onTranscriptRef = useRef(options.onTranscript);
  const onSummaryRef = useRef(options.onSummary);
  const onErrorRef = useRef(options.onError);
  const onStateChangeRef = useRef(options.onStateChange);
  useInsertionEffect(() => {
    onTranscriptRef.current = options.onTranscript;
    onSummaryRef.current = options.onSummary;
    onErrorRef.current = options.onError;
    onStateChangeRef.current = options.onStateChange;
  });

  const clientRef = useRef<VoiceVaultWsClient | null>(null);

  // Zustand store actions
  const setWsState = useRecordingStore((s) => s.setWsState);

  // ── Connect / disconnect lifecycle ──────────────────────────────────────

  useEffect(() => {
    if (recordingId === null) {
      // No recording → ensure disconnected
      clientRef.current?.disconnect();
      clientRef.current = null;
      setWsState("disconnected");
      return;
    }

    const clientOpts: WsClientOptions = {
      recordingId,
      language,
      token,
    };

    const client = new VoiceVaultWsClient(clientOpts);
    clientRef.current = client;

    // --- Subscribe to events ---

    const unsubs: (() => void)[] = [];

    unsubs.push(
      client.on("stateChange", (state) => {
        setWsState(state);
        onStateChangeRef.current?.(state);
      }),
    );

    unsubs.push(
      client.on("message", (msg: WsMessage) => {
        switch (msg.type) {
          case "transcript":
            onTranscriptRef.current?.(msg.data);
            break;
          case "summary":
            onSummaryRef.current?.(msg.data);
            break;
          case "error":
            onErrorRef.current?.(msg.data);
            break;
          // "connected" and "status" are handled internally by the client
        }
      }),
    );

    unsubs.push(
      client.on("error", (err) => {
        onErrorRef.current?.({ detail: err.message });
      }),
    );

    client.connect();

    return () => {
      for (const unsub of unsubs) unsub();
      client.disconnect();
      clientRef.current = null;
    };
  }, [recordingId, language, token, setWsState]);

  // ── Stable public API ───────────────────────────────────────────────────

  const sendAudio = useCallback((pcm16: ArrayBuffer) => {
    clientRef.current?.sendAudio(pcm16);
  }, []);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    clientRef.current = null;
  }, []);

  const connectionState = useRecordingStore((s) => s.wsState);

  return { connectionState, sendAudio, disconnect };
}
