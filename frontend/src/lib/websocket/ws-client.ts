/**
 * Low-level WebSocket client for the VoiceVault transcription endpoint.
 *
 * Responsibilities:
 * - Connect / disconnect lifecycle
 * - Auto-reconnect with exponential backoff + jitter
 * - Binary message sending (PCM16 audio chunks)
 * - JSON message parsing with discriminated-union type safety
 * - Connection state tracking via event listeners
 *
 * This module is framework-agnostic — React integration lives in
 * `@/hooks/useWebSocket`.
 */

import type {
  WsConnectionState,
  WsMessage,
  WsMessageType,
} from "@/types/ws-messages";
import { wsTranscribeUrl } from "@/lib/env";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface WsClientOptions {
  /** Recording session ID (required for the WS URL). */
  recordingId: number;
  /** ISO language code for transcription (e.g. "ko", "en"). */
  language?: string;
  /** Authentication token (when WS_AUTH_ENABLED on backend). */
  token?: string;
  /** Base delay in ms for first reconnect attempt. Default: 1000. */
  reconnectBaseDelay?: number;
  /** Maximum delay in ms between reconnect attempts. Default: 30000. */
  reconnectMaxDelay?: number;
  /** Maximum number of reconnect attempts. 0 = unlimited. Default: 10. */
  maxReconnectAttempts?: number;
}

// ---------------------------------------------------------------------------
// Event system
// ---------------------------------------------------------------------------

type WsEventMap = {
  /** Fires on every connection state transition. */
  stateChange: WsConnectionState;
  /** Fires for each parsed JSON message from the server. */
  message: WsMessage;
  /** Fires when the connection is permanently closed (no more retries). */
  close: { code: number; reason: string };
  /** Fires on WebSocket or parse error. */
  error: { message: string };
};

type WsEventName = keyof WsEventMap;
type WsListener<K extends WsEventName> = (payload: WsEventMap[K]) => void;

// ---------------------------------------------------------------------------
// Valid message types for runtime validation
// ---------------------------------------------------------------------------

const VALID_MESSAGE_TYPES = new Set<WsMessageType>([
  "connected",
  "transcript",
  "summary",
  "status",
  "error",
]);

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class VoiceVaultWsClient {
  // ── Config ──
  private readonly recordingId: number;
  private readonly language: string | undefined;
  private readonly token: string | undefined;
  private readonly baseDelay: number;
  private readonly maxDelay: number;
  private readonly maxAttempts: number;

  // ── State ──
  private ws: WebSocket | null = null;
  private _state: WsConnectionState = "disconnected";
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  // ── Event listeners ──
  private listeners = new Map<WsEventName, Set<WsListener<WsEventName>>>();

  constructor(options: WsClientOptions) {
    this.recordingId = options.recordingId;
    this.language = options.language;
    this.token = options.token;
    this.baseDelay = options.reconnectBaseDelay ?? 1_000;
    this.maxDelay = options.reconnectMaxDelay ?? 30_000;
    this.maxAttempts = options.maxReconnectAttempts ?? 10;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Current connection state (read-only). */
  get state(): WsConnectionState {
    return this._state;
  }

  /** Open the WebSocket connection. Safe to call multiple times. */
  connect(): void {
    if (this.disposed) return;
    if (this.ws) return; // already connected / connecting

    this.setState("connecting");
    const url = this.buildUrl();
    this.ws = new WebSocket(url);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = this.handleOpen;
    this.ws.onclose = this.handleClose;
    this.ws.onerror = this.handleError;
    this.ws.onmessage = this.handleMessage;
  }

  /** Gracefully close the connection. Stops reconnect attempts. */
  disconnect(): void {
    this.disposed = true;
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.onclose = null; // prevent reconnect on intentional close
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }
    this.setState("disconnected");
  }

  /** Send raw PCM16 audio bytes to the server. */
  sendAudio(pcm16: ArrayBuffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(pcm16);
    }
  }

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends WsEventName>(
    event: K,
    listener: WsListener<K>,
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(listener as WsListener<WsEventName>);
    return () => {
      set.delete(listener as WsListener<WsEventName>);
    };
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private buildUrl(): string {
    let url = wsTranscribeUrl(this.recordingId);
    if (this.language) url += `&language=${encodeURIComponent(this.language)}`;
    if (this.token) url += `&token=${encodeURIComponent(this.token)}`;
    return url;
  }

  private setState(next: WsConnectionState): void {
    if (this._state === next) return;
    this._state = next;
    this.emit("stateChange", next);
  }

  private handleOpen = (): void => {
    this.reconnectAttempt = 0;
    // State will transition to "connected" when we receive the "connected" message.
    // This prevents a brief "connected" flash before the server confirms.
  };

  private handleClose = (ev: CloseEvent): void => {
    this.ws = null;

    if (this.disposed) {
      this.setState("disconnected");
      return;
    }

    // Attempt reconnect
    if (this.maxAttempts > 0 && this.reconnectAttempt >= this.maxAttempts) {
      this.setState("disconnected");
      this.emit("close", { code: ev.code, reason: ev.reason });
      return;
    }

    this.setState("reconnecting");
    this.scheduleReconnect();
  };

  private handleError = (): void => {
    this.emit("error", { message: "WebSocket connection error" });
    // onclose will fire after onerror — reconnect logic lives there
  };

  private handleMessage = (ev: MessageEvent): void => {
    if (typeof ev.data !== "string") return; // ignore unexpected binary

    let parsed: unknown;
    try {
      parsed = JSON.parse(ev.data);
    } catch {
      this.emit("error", { message: "Failed to parse WebSocket message" });
      return;
    }

    if (!this.isValidMessage(parsed)) {
      this.emit("error", { message: `Unknown WS message type: ${JSON.stringify((parsed as Record<string, unknown>)?.type)}` });
      return;
    }

    const msg = parsed as WsMessage;

    // Transition to "connected" on handshake confirmation
    if (msg.type === "connected") {
      this.setState("connected");
    }

    this.emit("message", msg);
  };

  // ── Reconnect ───────────────────────────────────────────────────────────

  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    const delay = this.computeDelay();
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      if (!this.disposed) {
        this.connect();
      }
    }, delay);
  }

  /** Exponential backoff with ±25 % jitter. */
  private computeDelay(): number {
    const exponential = this.baseDelay * 2 ** this.reconnectAttempt;
    const capped = Math.min(exponential, this.maxDelay);
    const jitter = capped * (0.75 + Math.random() * 0.5); // 75%–125%
    return Math.round(jitter);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private isValidMessage(data: unknown): data is WsMessage {
    if (typeof data !== "object" || data === null) return false;
    const obj = data as Record<string, unknown>;
    return (
      typeof obj.type === "string" &&
      VALID_MESSAGE_TYPES.has(obj.type as WsMessageType) &&
      typeof obj.data === "object" &&
      obj.data !== null
    );
  }

  private emit<K extends WsEventName>(event: K, payload: WsEventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try {
        (fn as WsListener<K>)(payload);
      } catch {
        // Don't let a listener crash the client
      }
    }
  }
}
