"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SummaryList } from "@/components/summaries/SummaryList";
import { useRecordings, useRecording } from "@/hooks/useRecordings";
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

/** Returns true when a recording may still have summaries being generated. */
function isProcessing(status: RecordingStatus): boolean {
  return status === "active" || status === "processing";
}

export default function SummariesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      }
    >
      <SummariesContent />
    </Suspense>
  );
}

function SummariesContent() {
  const searchParams = useSearchParams();

  const [statusFilter, setStatusFilter] = useState<
    RecordingStatus | undefined
  >();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // D3: Auto-select recording from query param (e.g. /summaries?recording=5)
  useEffect(() => {
    const recordingParam = searchParams.get("recording");
    if (recordingParam !== null) {
      const id = Number(recordingParam);
      if (!Number.isNaN(id) && id > 0) {
        setSelectedId(id);
      }
    }
  }, [searchParams]);

  const { data: recordings, isLoading, error, refetch } = useRecordings({
    status: statusFilter,
    sort: "newest",
  });

  // D3: Track selected recording's server status for processing indicator
  const { data: selectedRecording } = useRecording(selectedId);
  const selectedIsProcessing =
    selectedRecording != null && isProcessing(selectedRecording.status);

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
                <div className="flex items-center justify-between">
                  <p className="font-medium">
                    {rec.title ?? `Recording #${rec.id}`}
                  </p>
                  {isProcessing(rec.status) && (
                    <Spinner size="sm" />
                  )}
                </div>
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
              <div className="space-y-4">
                {/* D3: Processing banner */}
                {selectedIsProcessing && (
                  <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
                    <Spinner size="sm" />
                    <span>
                      This recording is still being processed. Summaries will appear automatically.
                    </span>
                  </div>
                )}

                {/* D3: Failed banner */}
                {selectedRecording?.status === "failed" && (
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
                    <span>
                      Summary generation failed for this recording.
                    </span>
                  </div>
                )}

                <SummaryList
                  recordingId={selectedId}
                  isProcessing={selectedIsProcessing}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
