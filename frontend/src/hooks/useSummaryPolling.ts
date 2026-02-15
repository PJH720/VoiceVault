"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRecordingStore } from "@/stores/recording";
import { recordingsApi } from "@/lib/api/recordings";
import { summariesApi } from "@/lib/api/summaries";

const POLL_INTERVAL_MS = 3_000;

/**
 * Polls the backend after a recording stops to detect when summaries are ready.
 *
 * When the recording phase transitions to "stopped", this hook:
 * 1. Polls GET /recordings/{id} to track the recording's server-side status
 * 2. Polls GET /recordings/{id}/summaries to detect newly generated summaries
 * 3. Invalidates React Query caches so the summaries page auto-refreshes
 * 4. Updates the recording store's `postRecordingStatus` field
 *
 * Polling stops when the recording reaches "completed" or "failed" status.
 */
export function useSummaryPolling() {
  const queryClient = useQueryClient();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const phase = useRecordingStore((s) => s.phase);
  const currentRecordingId = useRecordingStore((s) => s.currentRecordingId);
  const setPostRecordingStatus = useRecordingStore(
    (s) => s.setPostRecordingStatus,
  );
  const postRecordingStatus = useRecordingStore(
    (s) => s.postRecordingStatus,
  );

  useEffect(() => {
    // Only poll when recording just stopped and we're still processing
    if (phase !== "stopped" || currentRecordingId === null) {
      return;
    }

    // Don't restart polling if already completed or failed
    if (
      postRecordingStatus === "complete" ||
      postRecordingStatus === "error"
    ) {
      return;
    }

    // Start polling
    setPostRecordingStatus("processing");

    let cancelled = false;

    async function poll() {
      if (cancelled || currentRecordingId === null) return;

      try {
        const [recording, summaries] = await Promise.all([
          recordingsApi.get(currentRecordingId),
          summariesApi.list(currentRecordingId),
        ]);

        if (cancelled) return;

        // Invalidate queries so UI components using useRecording/useSummaries refresh
        await queryClient.invalidateQueries({
          queryKey: ["recordings"],
        });
        await queryClient.invalidateQueries({
          queryKey: ["summaries", "minute", currentRecordingId],
        });
        await queryClient.invalidateQueries({
          queryKey: ["summaries", "hour", currentRecordingId],
        });

        // Check if post-processing is done
        if (recording.status === "failed") {
          setPostRecordingStatus("error");
          return;
        }

        // Recording completed and has summaries → done
        if (
          recording.status === "completed" &&
          summaries.length > 0
        ) {
          setPostRecordingStatus("complete");
          return;
        }

        // Still processing — schedule next poll
        if (!cancelled) {
          intervalRef.current = setTimeout(poll, POLL_INTERVAL_MS) as unknown as ReturnType<typeof setInterval>;
        }
      } catch {
        if (!cancelled) {
          // Network error — retry after interval
          intervalRef.current = setTimeout(poll, POLL_INTERVAL_MS) as unknown as ReturnType<typeof setInterval>;
        }
      }
    }

    // Initial poll after a short delay (let backend start processing)
    intervalRef.current = setTimeout(poll, 1_000) as unknown as ReturnType<typeof setInterval>;

    return () => {
      cancelled = true;
      if (intervalRef.current !== null) {
        clearTimeout(intervalRef.current as unknown as number);
        intervalRef.current = null;
      }
    };
  }, [
    phase,
    currentRecordingId,
    postRecordingStatus,
    setPostRecordingStatus,
    queryClient,
  ]);
}
