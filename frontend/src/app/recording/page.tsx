"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useMicrophonePermission } from "@/hooks/use-microphone-permission";
import { useMediaDevices } from "@/hooks/use-media-devices";
import { useAudioCapture } from "@/hooks/useAudioCapture";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useSummaryPolling } from "@/hooks/useSummaryPolling";
import { useRecordingStore } from "@/stores/recording";
import { recordingsApi } from "@/lib/api/recordings";
import { Spinner } from "@/components/ui/Spinner";
import type { WsErrorData } from "@/types/ws-messages";

import { PermissionGate } from "@/components/recording/PermissionGate";
import { DeviceSelector } from "@/components/recording/DeviceSelector";
import { RecordingControls } from "@/components/recording/RecordingControls";
import { RecordingStatus } from "@/components/recording/RecordingStatus";
import { TranscriptView } from "@/components/recording/TranscriptView";

export default function RecordingPage() {
  // ── C1: Microphone permission & device selection ──
  const { status: permStatus, request: requestPermission } = useMicrophonePermission();
  const { devices, selectedDeviceId, selectDevice, refresh } = useMediaDevices(
    permStatus === "granted",
  );

  // ── Global store selectors ──
  const phase = useRecordingStore((s) => s.phase);
  const currentRecordingId = useRecordingStore((s) => s.currentRecordingId);
  const captureStatus = useRecordingStore((s) => s.captureStatus);
  const wsState = useRecordingStore((s) => s.wsState);
  const startedAt = useRecordingStore((s) => s.startedAt);
  const errorMessage = useRecordingStore((s) => s.errorMessage);
  const transcripts = useRecordingStore((s) => s.transcripts);
  const summaries = useRecordingStore((s) => s.summaries);

  const postRecordingStatus = useRecordingStore((s) => s.postRecordingStatus);

  // ── D3: Poll for summaries after recording stops ──
  useSummaryPolling();

  const setSelectedDeviceId = useRecordingStore((s) => s.setSelectedDeviceId);
  const requestStart = useRecordingStore((s) => s.requestStart);
  const confirmRecording = useRecordingStore((s) => s.confirmRecording);
  const requestStop = useRecordingStore((s) => s.requestStop);
  const confirmStopped = useRecordingStore((s) => s.confirmStopped);
  const setError = useRecordingStore((s) => s.setError);
  const reset = useRecordingStore((s) => s.reset);
  const addTranscript = useRecordingStore((s) => s.addTranscript);
  const addSummary = useRecordingStore((s) => s.addSummary);

  // Sync device selection to store
  const handleDeviceSelect = useCallback(
    (deviceId: string) => {
      selectDevice(deviceId);
      setSelectedDeviceId(deviceId);
    },
    [selectDevice, setSelectedDeviceId],
  );

  // Ref for sendAudio so the onChunk callback stays stable
  const sendAudioRef = useRef<(pcm16: ArrayBuffer) => void>(() => {});

  // ── C2: Audio capture — sends PCM16 chunks to WS ──
  const { startCapture, stopCapture } = useAudioCapture({
    onChunk: useCallback(
      (pcm16: ArrayBuffer) => sendAudioRef.current(pcm16),
      [],
    ),
  });

  // ── C3: WebSocket — reactive on currentRecordingId ──
  const { sendAudio, disconnect: disconnectWs } = useWebSocket({
    recordingId: phase === "recording" || phase === "requesting" ? currentRecordingId : null,
    onTranscript: addTranscript,
    onSummary: addSummary,
    onError: useCallback(
      (data: WsErrorData) => {
        // WS errors during recording → log but don't halt
        if (useRecordingStore.getState().phase === "recording") {
          console.error("[WS error]", data.detail);
        }
      },
      [],
    ),
  });

  useEffect(() => {
    sendAudioRef.current = sendAudio;
  });

  // ── Orchestration: Start recording ──
  const handleStart = useCallback(async () => {
    requestStart();

    try {
      // 1. Create recording on backend
      const recording = await recordingsApi.create();

      // 2. Transition to recording (sets currentRecordingId → WS auto-connects)
      confirmRecording(recording.id);

      // 3. Start audio capture
      await startCapture();
    } catch (err) {
      // Clean up on failure
      stopCapture();
      disconnectWs();
      setError(err instanceof Error ? err.message : "Failed to start recording");
    }
  }, [requestStart, confirmRecording, startCapture, stopCapture, disconnectWs, setError]);

  // ── Orchestration: Stop recording ──
  const handleStop = useCallback(async () => {
    requestStop();

    try {
      // 1. Stop audio capture first (flush remaining chunks)
      stopCapture();

      // 2. Disconnect WebSocket
      disconnectWs();

      // 3. Tell backend to stop
      const recId = useRecordingStore.getState().currentRecordingId;
      if (recId !== null) {
        await recordingsApi.stop(recId);
      }

      confirmStopped();
    } catch (err) {
      // Stop failed — force cleanup
      stopCapture();
      disconnectWs();
      setError(err instanceof Error ? err.message : "Failed to stop recording");
    }
  }, [requestStop, stopCapture, disconnectWs, confirmStopped, setError]);

  // ── Orchestration: Reset ──
  const handleReset = useCallback(() => {
    stopCapture();
    disconnectWs();
    reset();
  }, [stopCapture, disconnectWs, reset]);

  // ── Render ──
  const isRecording = phase === "recording";
  const showTranscript = phase === "recording" || phase === "stopping" || phase === "stopped";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold">Recording</h1>

      <PermissionGate status={permStatus} onRequest={requestPermission}>
        <div className="w-full max-w-lg space-y-6">
          {/* Device selector — hidden during active recording */}
          {phase !== "recording" && phase !== "stopping" && (
            <DeviceSelector
              devices={devices}
              selectedDeviceId={selectedDeviceId}
              onSelect={handleDeviceSelect}
              onRefresh={refresh}
            />
          )}

          {/* Status display */}
          <RecordingStatus
            phase={phase}
            captureStatus={captureStatus}
            wsState={wsState}
            startedAt={startedAt}
            errorMessage={errorMessage}
            transcriptCount={transcripts.length}
            summaryCount={summaries.length}
          />

          {/* Start / Stop / Reset button */}
          <div className="flex justify-center">
            <RecordingControls
              phase={phase}
              onStart={handleStart}
              onStop={handleStop}
              onReset={handleReset}
            />
          </div>

          {/* Live transcript */}
          {showTranscript && (
            <TranscriptView
              transcripts={transcripts}
              summaries={summaries}
              isRecording={isRecording}
            />
          )}

          {/* D3: Post-recording status banner */}
          {phase === "stopped" && postRecordingStatus === "processing" && (
            <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
              <Spinner size="sm" />
              <span>Generating summaries…</span>
            </div>
          )}

          {phase === "stopped" && postRecordingStatus === "complete" && (
            <Link
              href={`/summaries?recording=${currentRecordingId}`}
              className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 transition-colors hover:bg-green-100 dark:border-green-800 dark:bg-green-950/50 dark:text-green-300 dark:hover:bg-green-900/50"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-5 w-5 shrink-0"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                  clipRule="evenodd"
                />
              </svg>
              <span>
                Summaries ready — <span className="underline">view them now</span>
              </span>
            </Link>
          )}

          {phase === "stopped" && postRecordingStatus === "error" && (
            <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-5 w-5 shrink-0"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Summary generation failed. You can retry from the summaries page.</span>
            </div>
          )}
        </div>
      </PermissionGate>
    </div>
  );
}
