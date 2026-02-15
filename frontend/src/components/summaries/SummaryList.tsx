"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { MinuteSummaryCard, HourSummaryCard } from "./SummaryCard";
import { useMinuteSummaries, useHourSummaries } from "@/hooks/useSummaries";
import { ApiError } from "@/lib/api-client";

type Tab = "minute" | "hour";

interface SummaryListProps {
  recordingId: number;
}

export function SummaryList({ recordingId }: SummaryListProps) {
  const [tab, setTab] = useState<Tab>("minute");

  const minute = useMinuteSummaries(recordingId);
  const hour = useHourSummaries(recordingId);

  const active = tab === "minute" ? minute : hour;

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-2">
        <Button
          variant={tab === "minute" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setTab("minute")}
        >
          Minute summaries
        </Button>
        <Button
          variant={tab === "hour" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setTab("hour")}
        >
          Hour summaries
        </Button>
      </div>

      {/* Loading */}
      {active.isLoading && (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {/* Error */}
      {active.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          <p className="font-medium">Failed to load summaries</p>
          <p className="mt-1">
            {active.error instanceof ApiError
              ? active.error.message
              : "An unexpected error occurred."}
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => active.refetch()}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Empty */}
      {active.data && active.data.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-400">
          No {tab} summaries yet for this recording.
        </p>
      )}

      {/* Cards */}
      {tab === "minute" && minute.data && minute.data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {minute.data.map((s) => (
            <MinuteSummaryCard key={s.id} summary={s} />
          ))}
        </div>
      )}

      {tab === "hour" && hour.data && hour.data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
          {hour.data.map((s) => (
            <HourSummaryCard key={s.id} summary={s} />
          ))}
        </div>
      )}
    </div>
  );
}
