"use client";

import { useQuery } from "@tanstack/react-query";
import { summariesApi } from "@/lib/api/summaries";

export function useMinuteSummaries(recordingId: number | null) {
  return useQuery({
    queryKey: ["summaries", "minute", recordingId],
    queryFn: () => summariesApi.list(recordingId!),
    enabled: recordingId !== null,
  });
}

export function useHourSummaries(recordingId: number | null) {
  return useQuery({
    queryKey: ["summaries", "hour", recordingId],
    queryFn: () => summariesApi.hourSummaries(recordingId!),
    enabled: recordingId !== null,
  });
}
