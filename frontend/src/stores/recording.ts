import { create } from "zustand";

import type { CaptureStatus } from "@/hooks/useAudioCapture";

interface RecordingState {
  // ── C1: Device selection ──
  selectedDeviceId: string | null;
  setSelectedDeviceId: (deviceId: string | null) => void;

  // ── Recording session ──
  isRecording: boolean;
  currentRecordingId: number | null;
  start: (id: number) => void;
  stop: () => void;

  // ── C2: Audio capture status ──
  captureStatus: CaptureStatus;
  sampleRate: number | null;
  setCaptureStatus: (status: CaptureStatus) => void;
  setSampleRate: (rate: number | null) => void;
}

export const useRecordingStore = create<RecordingState>((set) => ({
  // ── C1 ──
  selectedDeviceId: null,
  setSelectedDeviceId: (deviceId) => set({ selectedDeviceId: deviceId }),

  // ── Recording session ──
  isRecording: false,
  currentRecordingId: null,
  start: (id) => set({ isRecording: true, currentRecordingId: id }),
  stop: () =>
    set({
      isRecording: false,
      currentRecordingId: null,
      captureStatus: "idle",
      sampleRate: null,
    }),

  // ── C2 ──
  captureStatus: "idle",
  sampleRate: null,
  setCaptureStatus: (captureStatus) => set({ captureStatus }),
  setSampleRate: (sampleRate) => set({ sampleRate }),
}));
