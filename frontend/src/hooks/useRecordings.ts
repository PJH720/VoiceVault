"use client";

import { useQuery } from "@tanstack/react-query";
import { recordingsApi } from "@/lib/api/recordings";
import type { RecordingResponse, RecordingStatus } from "@/types/api";

export const recordingsQueryKey = ["recordings"] as const;

export function useRecordings(filters?: {
  status?: RecordingStatus;
  sort?: "newest" | "oldest";
}) {
  return useQuery({
    queryKey: [...recordingsQueryKey, filters],
    queryFn: async () => {
      const data = await recordingsApi.list();
      return applyFilters(data, filters);
    },
  });
}

export function useRecording(id: number | null) {
  return useQuery({
    queryKey: [...recordingsQueryKey, id],
    queryFn: () => recordingsApi.get(id!),
    enabled: id !== null,
  });
}

function applyFilters(
  recordings: RecordingResponse[],
  filters?: { status?: RecordingStatus; sort?: "newest" | "oldest" },
): RecordingResponse[] {
  let result = recordings;

  if (filters?.status) {
    result = result.filter((r) => r.status === filters.status);
  }

  const direction = filters?.sort ?? "newest";
  result = [...result].sort((a, b) => {
    const diff =
      new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
    return direction === "newest" ? diff : -diff;
  });

  return result;
}
