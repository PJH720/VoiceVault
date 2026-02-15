import { create } from "zustand";

interface RecordingState {
  isRecording: boolean;
  currentRecordingId: number | null;
  start: (id: number) => void;
  stop: () => void;
}

export const useRecordingStore = create<RecordingState>((set) => ({
  isRecording: false,
  currentRecordingId: null,
  start: (id) => set({ isRecording: true, currentRecordingId: id }),
  stop: () => set({ isRecording: false, currentRecordingId: null }),
}));
