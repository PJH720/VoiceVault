import { create } from "zustand";

import type { CaptureStatus } from "@/hooks/useAudioCapture";
import type { WsConnectionState, WsTranscriptData, WsSummaryData } from "@/types/ws-messages";

// ---------------------------------------------------------------------------
// Recording phase state machine
// ---------------------------------------------------------------------------

/**
 * Recording lifecycle phases:
 *
 *   idle → requesting → recording → stopping → stopped
 *                 ↘        ↘           ↘
 *                       error ←←←←←←←←←
 *
 * - idle:       No active session. Ready to start.
 * - requesting: POST /recordings sent, awaiting API + audio + WS setup.
 * - recording:  Audio capture active, WS connected, transcripts flowing.
 * - stopping:   Stop requested, tearing down capture + WS + PATCH /stop.
 * - stopped:    Session complete. Transcripts preserved for review.
 * - error:      Something failed. `errorMessage` has details.
 */
export type RecordingPhase =
  | "idle"
  | "requesting"
  | "recording"
  | "stopping"
  | "stopped"
  | "error";

// ---------------------------------------------------------------------------
// Transcript entry
// ---------------------------------------------------------------------------

export interface TranscriptEntry {
  id: number;
  text: string;
  confidence?: number;
  language?: string;
  timestamp: number; // Date.now() when received
}

// ---------------------------------------------------------------------------
// Post-recording status (server-side summary generation tracking)
// ---------------------------------------------------------------------------

/**
 * Tracks the server-side post-processing state after a recording stops:
 *
 *   idle → processing → complete
 *                    ↘ error
 *
 * - idle:       No post-processing active (before recording or after reset).
 * - processing: Backend is generating summaries / classifications.
 * - complete:   Summaries are ready on the server.
 * - error:      Summary generation failed.
 */
export type PostRecordingStatus = "idle" | "processing" | "complete" | "error";

// ---------------------------------------------------------------------------
// Summary entry
// ---------------------------------------------------------------------------

export interface SummaryEntry {
  minuteIndex: number;
  summaryText: string;
  keywords?: string[];
  speakers?: string[];
  confidence?: number;
  modelUsed?: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface RecordingState {
  // ── C1: Device selection ──
  selectedDeviceId: string | null;
  setSelectedDeviceId: (deviceId: string | null) => void;

  // ── C4: Recording phase state machine ──
  phase: RecordingPhase;
  currentRecordingId: number | null;
  errorMessage: string | null;
  startedAt: number | null; // Date.now() when recording started

  // Phase transitions
  requestStart: () => void;
  confirmRecording: (recordingId: number) => void;
  requestStop: () => void;
  confirmStopped: () => void;
  setError: (message: string) => void;
  reset: () => void;

  // ── C2: Audio capture status ──
  captureStatus: CaptureStatus;
  sampleRate: number | null;
  setCaptureStatus: (status: CaptureStatus) => void;
  setSampleRate: (rate: number | null) => void;

  // ── C3: WebSocket connection status ──
  wsState: WsConnectionState;
  setWsState: (state: WsConnectionState) => void;

  // ── C4: Transcript & summary accumulation ──
  transcripts: TranscriptEntry[];
  summaries: SummaryEntry[];
  addTranscript: (data: WsTranscriptData) => void;
  addSummary: (data: WsSummaryData) => void;

  // ── D3: Post-recording status tracking ──
  postRecordingStatus: PostRecordingStatus;
  setPostRecordingStatus: (status: PostRecordingStatus) => void;
}

// ---------------------------------------------------------------------------
// Auto-increment ID for transcript entries
// ---------------------------------------------------------------------------

let nextTranscriptId = 0;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useRecordingStore = create<RecordingState>((set) => ({
  // ── C1 ──
  selectedDeviceId: null,
  setSelectedDeviceId: (deviceId) => set({ selectedDeviceId: deviceId }),

  // ── C4: State machine ──
  phase: "idle",
  currentRecordingId: null,
  errorMessage: null,
  startedAt: null,

  requestStart: () =>
    set({ phase: "requesting", errorMessage: null }),

  confirmRecording: (recordingId) =>
    set({
      phase: "recording",
      currentRecordingId: recordingId,
      startedAt: Date.now(),
      errorMessage: null,
      transcripts: [],
      summaries: [],
    }),

  requestStop: () =>
    set({ phase: "stopping" }),

  confirmStopped: () =>
    set({
      phase: "stopped",
      captureStatus: "idle",
      sampleRate: null,
      wsState: "disconnected",
    }),

  setError: (message) =>
    set({
      phase: "error",
      errorMessage: message,
      captureStatus: "idle",
      sampleRate: null,
      wsState: "disconnected",
    }),

  reset: () =>
    set({
      phase: "idle",
      currentRecordingId: null,
      errorMessage: null,
      startedAt: null,
      captureStatus: "idle",
      sampleRate: null,
      wsState: "disconnected",
      transcripts: [],
      summaries: [],
      postRecordingStatus: "idle",
    }),

  // ── C2 ──
  captureStatus: "idle",
  sampleRate: null,
  setCaptureStatus: (captureStatus) => set({ captureStatus }),
  setSampleRate: (sampleRate) => set({ sampleRate }),

  // ── C3 ──
  wsState: "disconnected",
  setWsState: (wsState) => set({ wsState }),

  // ── C4: Transcript & summary accumulation ──
  transcripts: [],
  summaries: [],

  addTranscript: (data) =>
    set((state) => ({
      transcripts: [
        ...state.transcripts,
        {
          id: nextTranscriptId++,
          text: data.text,
          confidence: data.confidence,
          language: data.language,
          timestamp: Date.now(),
        },
      ],
    })),

  addSummary: (data) =>
    set((state) => ({
      summaries: [
        ...state.summaries,
        {
          minuteIndex: data.minute_index,
          summaryText: data.summary_text,
          keywords: data.keywords,
          speakers: data.speakers,
          confidence: data.confidence,
          modelUsed: data.model_used,
          timestamp: Date.now(),
        },
      ],
    })),

  // ── D3 ──
  postRecordingStatus: "idle",
  setPostRecordingStatus: (postRecordingStatus) => set({ postRecordingStatus }),
}));
