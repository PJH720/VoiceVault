"use client";

import { useCallback, useEffect, useState } from "react";
import type { RecordingPhase } from "@/stores/recording";
import type { CaptureStatus } from "@/hooks/useAudioCapture";
import type { WsConnectionState } from "@/types/ws-messages";
import { cn } from "@/lib/cn";

interface RecordingStatusProps {
  phase: RecordingPhase;
  captureStatus: CaptureStatus;
  wsState: WsConnectionState;
  startedAt: number | null;
  errorMessage: string | null;
  transcriptCount: number;
  summaryCount: number;
  className?: string;
}

export function RecordingStatus({
  phase,
  captureStatus,
  wsState,
  startedAt,
  errorMessage,
  transcriptCount,
  summaryCount,
  className,
}: RecordingStatusProps) {
  const elapsed = useElapsedTime(phase === "recording" ? startedAt : null);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Duration display */}
      {(phase === "recording" || phase === "stopping") && (
        <div className="text-center">
          <span className="font-mono text-4xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
            {formatDuration(elapsed)}
          </span>
        </div>
      )}

      {/* Status badges */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <StatusBadge
          label={phaseLabel(phase)}
          color={phaseColor(phase)}
        />

        {phase === "recording" && (
          <>
            <StatusBadge
              label={captureLabel(captureStatus)}
              color={captureStatus === "capturing" ? "green" : "zinc"}
            />
            <StatusBadge
              label={wsLabel(wsState)}
              color={wsColor(wsState)}
            />
          </>
        )}
      </div>

      {/* Counts */}
      {(transcriptCount > 0 || summaryCount > 0) && (
        <div className="flex items-center justify-center gap-4 text-xs text-zinc-500">
          {transcriptCount > 0 && (
            <span>{transcriptCount} segment{transcriptCount !== 1 ? "s" : ""}</span>
          )}
          {summaryCount > 0 && (
            <span>{summaryCount} summar{summaryCount !== 1 ? "ies" : "y"}</span>
          )}
        </div>
      )}

      {/* Error message */}
      {phase === "error" && errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {errorMessage}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------

type BadgeColor = "green" | "red" | "yellow" | "blue" | "zinc";

const colorStyles: Record<BadgeColor, string> = {
  green: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  zinc: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

function StatusBadge({ label, color }: { label: string; color: BadgeColor }) {
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", colorStyles[color])}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Label / color helpers
// ---------------------------------------------------------------------------

function phaseLabel(phase: RecordingPhase): string {
  switch (phase) {
    case "idle": return "Ready";
    case "requesting": return "Starting…";
    case "recording": return "Recording";
    case "stopping": return "Stopping…";
    case "stopped": return "Stopped";
    case "error": return "Error";
  }
}

function phaseColor(phase: RecordingPhase): BadgeColor {
  switch (phase) {
    case "idle": return "zinc";
    case "requesting": return "yellow";
    case "recording": return "red";
    case "stopping": return "yellow";
    case "stopped": return "blue";
    case "error": return "red";
  }
}

function captureLabel(status: CaptureStatus): string {
  switch (status) {
    case "idle": return "Mic idle";
    case "starting": return "Mic starting…";
    case "capturing": return "Mic active";
    case "error": return "Mic error";
  }
}

function wsLabel(state: WsConnectionState): string {
  switch (state) {
    case "disconnected": return "WS off";
    case "connecting": return "WS connecting…";
    case "connected": return "WS connected";
    case "reconnecting": return "WS reconnecting…";
  }
}

function wsColor(state: WsConnectionState): BadgeColor {
  switch (state) {
    case "disconnected": return "zinc";
    case "connecting": return "yellow";
    case "connected": return "green";
    case "reconnecting": return "yellow";
  }
}

// ---------------------------------------------------------------------------
// Elapsed time hook
// ---------------------------------------------------------------------------

function useElapsedTime(startedAt: number | null): number {
  const calcElapsed = useCallback(
    () => (startedAt === null ? 0 : Math.floor((Date.now() - startedAt) / 1000)),
    [startedAt],
  );

  const [elapsed, setElapsed] = useState(calcElapsed);

  useEffect(() => {
    // Recalculate immediately when startedAt changes (via interval callback)
    const tick = () => setElapsed(calcElapsed());

    // First tick right away in an interval callback (not synchronous in effect body)
    const immediate = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);

    return () => {
      clearTimeout(immediate);
      clearInterval(timer);
    };
  }, [calcElapsed]);

  return elapsed;
}

// ---------------------------------------------------------------------------
// Format duration as HH:MM:SS
// ---------------------------------------------------------------------------

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");

  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
