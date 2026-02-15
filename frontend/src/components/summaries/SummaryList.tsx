"use client";

import { useState } from "react";
import { MinuteSummaryCard, HourSummaryCard } from "./SummaryCard";
import { SummaryTabs, type SummaryTab } from "./SummaryTabs";
import { SummaryCardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { useMinuteSummaries, useHourSummaries } from "@/hooks/useSummaries";

interface SummaryListProps {
  recordingId: number;
  /** When true, summaries are polled at a short interval for live updates. */
  isProcessing?: boolean;
}

const MINUTE_SKELETON_COUNT = 6;
const HOUR_SKELETON_COUNT = 2;
const PROCESSING_REFETCH_MS = 5_000;

export function SummaryList({ recordingId, isProcessing }: SummaryListProps) {
  const [tab, setTab] = useState<SummaryTab>("minute");

  const minute = useMinuteSummaries(recordingId, {
    refetchInterval: isProcessing ? PROCESSING_REFETCH_MS : false,
  });
  const hour = useHourSummaries(recordingId, {
    refetchInterval: isProcessing ? PROCESSING_REFETCH_MS : false,
  });

  const active = tab === "minute" ? minute : hour;
  const skeletonCount =
    tab === "minute" ? MINUTE_SKELETON_COUNT : HOUR_SKELETON_COUNT;

  return (
    <SummaryTabs
      value={tab}
      onChange={setTab}
      minuteCount={minute.data?.length}
      hourCount={hour.data?.length}
    >
      {/* Loading */}
      {active.isLoading && (
        <div
          className={
            tab === "minute"
              ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              : "grid gap-4 sm:grid-cols-1 lg:grid-cols-2"
          }
        >
          {Array.from({ length: skeletonCount }, (_, i) => (
            <SummaryCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Error */}
      {active.error && (
        <ErrorState
          title="Failed to load summaries"
          error={active.error}
          onRetry={() => active.refetch()}
        />
      )}

      {/* Empty */}
      {active.data && active.data.length === 0 && (
        <EmptyState
          icon={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-10 w-10"
              aria-hidden="true"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
              <path d="M14 2v6h6" />
              <path d="M16 13H8" />
              <path d="M16 17H8" />
              <path d="M10 9H8" />
            </svg>
          }
          title={`No ${tab} summaries yet`}
          description="Summaries will appear here once the recording is processed."
        />
      )}

      {/* Minute cards */}
      {tab === "minute" && minute.data && minute.data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {minute.data.map((s) => (
            <MinuteSummaryCard key={s.id} summary={s} />
          ))}
        </div>
      )}

      {/* Hour cards */}
      {tab === "hour" && hour.data && hour.data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
          {hour.data.map((s) => (
            <HourSummaryCard key={s.id} summary={s} />
          ))}
        </div>
      )}
    </SummaryTabs>
  );
}
