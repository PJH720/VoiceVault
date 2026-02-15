"use client";

import { useCallback, useEffect, useState } from "react";

export interface AudioDevice {
  deviceId: string;
  label: string;
}

interface UseMediaDevicesReturn {
  devices: AudioDevice[];
  selectedDeviceId: string | null;
  selectDevice: (deviceId: string) => void;
  refresh: () => Promise<void>;
}

export function useMediaDevices(permissionGranted: boolean): UseMediaDevicesReturn {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const enumerate = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;

    const allDevices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = allDevices
      .filter((d) => d.kind === "audioinput")
      .map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone ${i + 1}`,
      }));

    setDevices(audioInputs);

    // Auto-select first device if nothing selected or previous selection is gone
    setSelectedDeviceId((prev) => {
      if (prev && audioInputs.some((d) => d.deviceId === prev)) return prev;
      return audioInputs[0]?.deviceId ?? null;
    });
  }, []);

  // Enumerate when permission is granted
  useEffect(() => {
    if (permissionGranted) {
      enumerate();
    }
  }, [permissionGranted, enumerate]);

  // Listen for device hot-plug/unplug
  useEffect(() => {
    if (!permissionGranted) return;

    const handler = () => enumerate();
    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () => navigator.mediaDevices.removeEventListener("devicechange", handler);
  }, [permissionGranted, enumerate]);

  return {
    devices,
    selectedDeviceId,
    selectDevice: setSelectedDeviceId,
    refresh: enumerate,
  };
}
