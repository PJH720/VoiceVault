"use client";

import type { RecordingPhase } from "@/stores/recording";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";

interface RecordingControlsProps {
  phase: RecordingPhase;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
}

export function RecordingControls({
  phase,
  onStart,
  onStop,
  onReset,
}: RecordingControlsProps) {
  switch (phase) {
    case "idle":
      return (
        <Button size="lg" onClick={onStart} className="gap-2">
          <RecordIcon />
          Start Recording
        </Button>
      );

    case "requesting":
      return (
        <Button size="lg" disabled className="gap-2">
          <Spinner size="sm" />
          Starting…
        </Button>
      );

    case "recording":
      return (
        <Button
          size="lg"
          variant="secondary"
          onClick={onStop}
          className="gap-2 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
        >
          <StopIcon />
          Stop Recording
        </Button>
      );

    case "stopping":
      return (
        <Button size="lg" variant="secondary" disabled className="gap-2">
          <Spinner size="sm" />
          Stopping…
        </Button>
      );

    case "stopped":
      return (
        <Button size="lg" onClick={onReset} className="gap-2">
          <RecordIcon />
          New Recording
        </Button>
      );

    case "error":
      return (
        <Button size="lg" onClick={onReset} className="gap-2">
          <RecordIcon />
          Try Again
        </Button>
      );
  }
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function RecordIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  );
}
