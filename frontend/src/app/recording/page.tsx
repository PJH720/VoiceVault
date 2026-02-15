"use client";

import { useEffect } from "react";
import { useMicrophonePermission } from "@/hooks/use-microphone-permission";
import { useMediaDevices } from "@/hooks/use-media-devices";
import { useRecordingStore } from "@/stores/recording";
import { PermissionGate } from "@/components/recording/PermissionGate";
import { DeviceSelector } from "@/components/recording/DeviceSelector";

export default function RecordingPage() {
  const { status, request } = useMicrophonePermission();
  const { devices, selectedDeviceId, selectDevice, refresh } = useMediaDevices(
    status === "granted",
  );

  const setSelectedDeviceId = useRecordingStore((s) => s.setSelectedDeviceId);

  // Sync local device selection to global store
  useEffect(() => {
    setSelectedDeviceId(selectedDeviceId);
  }, [selectedDeviceId, setSelectedDeviceId]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold">Recording</h1>

      <PermissionGate status={status} onRequest={request}>
        <div className="w-full max-w-md space-y-6">
          <DeviceSelector
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelect={selectDevice}
            onRefresh={refresh}
          />
          <p className="text-center text-sm text-zinc-500">
            Microphone ready. Recording controls coming soon.
          </p>
        </div>
      </PermissionGate>
    </div>
  );
}
