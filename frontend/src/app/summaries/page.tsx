"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SummaryList } from "@/components/summaries/SummaryList";
import { useRecordings } from "@/hooks/useRecordings";
import type { RecordingResponse, RecordingStatus } from "@/types/api";

const STATUS_LABELS: Record<RecordingStatus, string> = {
  active: "Active",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  imported: "Imported",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function SummariesPage() {
  const [statusFilter, setStatusFilter] = useState<
    RecordingStatus | undefined
  >();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: recordings, isLoading, error, refetch } = useRecordings({
    status: statusFilter,
    sort: "newest",
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Summaries</h1>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={statusFilter === undefined ? "primary" : "secondary"}
          size="sm"
          onClick={() => setStatusFilter(undefined)}
        >
          All
        </Button>
        {(
          Object.entries(STATUS_LABELS) as [RecordingStatus, string][]
        ).map(([value, label]) => (
          <Button
            key={value}
            variant={statusFilter === value ? "primary" : "secondary"}
            size="sm"
            onClick={() => setStatusFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      )}

      {/* Error */}
      {error && (
        <ErrorState
          title="Failed to load recordings"
          error={error}
          onRetry={() => refetch()}
        />
      )}

      {/* Empty */}
      {recordings && recordings.length === 0 && (
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
              <circle cx="12" cy="12" r="10" />
              <path d="m12 8 4 4-4 4" />
              <path d="M8 12h8" />
            </svg>
          }
          title="No recordings found"
          description="Start a recording to see summaries here."
        />
      )}

      {/* Recordings list */}
      {recordings && recordings.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {/* Sidebar: recording list */}
          <div className="space-y-2 md:col-span-1">
            {recordings.map((rec: RecordingResponse) => (
              <button
                key={rec.id}
                type="button"
                onClick={() => setSelectedId(rec.id)}
                className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                  selectedId === rec.id
                    ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-900"
                    : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
                }`}
              >
                <p className="font-medium">
                  {rec.title ?? `Recording #${rec.id}`}
                </p>
                <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
                  <span>{formatDate(rec.started_at)}</span>
                  <span>&middot;</span>
                  <span>{formatDuration(rec.total_minutes)}</span>
                  <span>&middot;</span>
                  <span className="capitalize">{rec.status}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Main: summaries panel */}
          <div className="md:col-span-2">
            {selectedId === null ? (
              <Card>
                <CardContent className="py-12 text-center text-zinc-400">
                  Select a recording to view its summaries.
                </CardContent>
              </Card>
            ) : (
              <SummaryList recordingId={selectedId} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
