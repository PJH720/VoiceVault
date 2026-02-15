"use client";

import type { AudioDevice } from "@/hooks/use-media-devices";
import { cn } from "@/lib/cn";

interface DeviceSelectorProps {
  devices: AudioDevice[];
  selectedDeviceId: string | null;
  onSelect: (deviceId: string) => void;
  onRefresh: () => void;
  className?: string;
}

export function DeviceSelector({
  devices,
  selectedDeviceId,
  onSelect,
  onRefresh,
  className,
}: DeviceSelectorProps) {
  if (devices.length === 0) {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-zinc-500", className)}>
        <MicOffIcon />
        <span>No audio devices found.</span>
        <button
          type="button"
          onClick={onRefresh}
          className="text-zinc-900 underline underline-offset-2 hover:text-zinc-700 dark:text-zinc-300 dark:hover:text-zinc-100"
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <label htmlFor="device-select" className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        <MicIcon />
        <span>Microphone</span>
      </label>
      <select
        id="device-select"
        value={selectedDeviceId ?? ""}
        onChange={(e) => onSelect(e.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 transition-colors focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        {devices.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function MicIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <line x1="2" x2="22" y1="2" y2="22" />
      <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
      <path d="M5 10v2a7 7 0 0 0 12 5.29" />
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}
