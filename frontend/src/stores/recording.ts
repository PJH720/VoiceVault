import { create } from "zustand";

interface RecordingState {
  isRecording: boolean;
  currentRecordingId: number | null;
  selectedDeviceId: string | null;
  start: (id: number) => void;
  stop: () => void;
  setSelectedDeviceId: (deviceId: string | null) => void;
}

export const useRecordingStore = create<RecordingState>((set) => ({
  isRecording: false,
  currentRecordingId: null,
  selectedDeviceId: null,
  start: (id) => set({ isRecording: true, currentRecordingId: id }),
  stop: () => set({ isRecording: false, currentRecordingId: null }),
  setSelectedDeviceId: (deviceId) => set({ selectedDeviceId: deviceId }),
}));
