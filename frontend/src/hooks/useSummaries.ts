"use client";

import { useQuery } from "@tanstack/react-query";
import { summariesApi } from "@/lib/api/summaries";

interface SummaryQueryOptions {
  /** Poll interval in ms. Pass `false` to disable polling. */
  refetchInterval?: number | false;
}

export function useMinuteSummaries(
  recordingId: number | null,
  options?: SummaryQueryOptions,
) {
  return useQuery({
    queryKey: ["summaries", "minute", recordingId],
    queryFn: () => summariesApi.list(recordingId!),
    enabled: recordingId !== null,
    refetchInterval: options?.refetchInterval,
  });
}

export function useHourSummaries(
  recordingId: number | null,
  options?: SummaryQueryOptions,
) {
  return useQuery({
    queryKey: ["summaries", "hour", recordingId],
    queryFn: () => summariesApi.hourSummaries(recordingId!),
    enabled: recordingId !== null,
    refetchInterval: options?.refetchInterval,
  });
}
