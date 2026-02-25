"use client";

import { Suspense, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { useRecordings } from "@/hooks/useRecordings";
import { exportApi } from "@/lib/api/export";
import type { RecordingResponse, ObsidianExportResponse } from "@/types/api";

const CATEGORY_FILTER_OPTIONS = ["All", "lecture", "conversation", "memo", "other"] as const;

interface ExportResult {
  recordingId: number;
  status: "pending" | "success" | "error";
  data?: ObsidianExportResponse;
  error?: string;
}

export default function ExportPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      }
    >
      <ExportContent />
    </Suspense>
  );
}

function ExportContent() {
  const { data: recordings, isLoading, error, refetch } = useRecordings({
    sort: "newest",
  });

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [includeTranscript, setIncludeTranscript] = useState(true);
  const [vaultPath, setVaultPath] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [results, setResults] = useState<ExportResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  function toggleSelection(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const filteredRecordings = recordings?.filter((rec) => {
    if (categoryFilter === "All") return true;
    return rec.status === categoryFilter;
  });

  async function handleExport() {
    if (selectedIds.size === 0) return;

    setIsExporting(true);
    const ids = Array.from(selectedIds);
    const initialResults: ExportResult[] = ids.map((id) => ({
      recordingId: id,
      status: "pending" as const,
    }));
    setResults(initialResults);

    for (let i = 0; i < ids.length; i++) {
      setCurrentIndex(i);
      const id = ids[i]!;
      try {
        const data = await exportApi.exportRecording(id, {
          format: "obsidian",
          include_transcript: includeTranscript,
          vault_path: vaultPath || undefined,
        });
        setResults((prev) =>
          prev.map((r) =>
            r.recordingId === id ? { ...r, status: "success" as const, data } : r,
          ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Export failed";
        setResults((prev) =>
          prev.map((r) =>
            r.recordingId === id ? { ...r, status: "error" as const, error: message } : r,
          ),
        );
      }
    }

    setIsExporting(false);
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString();
  }

  const hasResults = results.length > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Export to Obsidian</h1>

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

      {/* No recordings */}
      {recordings && recordings.length === 0 && (
        <EmptyState
          title="No recordings found"
          description="Start a recording to export it later."
        />
      )}

      {recordings && recordings.length > 0 && !hasResults && (
        <>
          {/* Step 1: Select recordings */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Step 1 — Select recordings
              </h2>
              <div className="flex items-center gap-2">
                <label className="text-xs text-zinc-400">Filter:</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  {CATEGORY_FILTER_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt === "All" ? "All" : opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {filteredRecordings?.map((rec: RecordingResponse) => (
                <button
                  key={rec.id}
                  type="button"
                  onClick={() => toggleSelection(rec.id)}
                  className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                    selectedIds.has(rec.id)
                      ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-900"
                      : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-xs ${
                        selectedIds.has(rec.id)
                          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                          : "border-zinc-300 dark:border-zinc-600"
                      }`}
                    >
                      {selectedIds.has(rec.id) && "✓"}
                    </span>
                    <span className="font-medium">
                      {rec.title ?? `Recording #${rec.id}`}
                    </span>
                  </div>
                  <div className="mt-1 ml-6 flex items-center gap-2 text-xs text-zinc-400">
                    <span>{formatDate(rec.started_at)}</span>
                    <span>&middot;</span>
                    <span>{rec.total_minutes}m</span>
                    <span>&middot;</span>
                    <span className="capitalize">{rec.status}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Options */}
          {selectedIds.size > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Step 2 — Export options
              </h2>
              <Card>
                <CardContent className="space-y-4">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={includeTranscript}
                      onChange={(e) => setIncludeTranscript(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
                    />
                    <span className="text-sm">Include full transcript</span>
                  </label>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Vault path (optional)
                    </label>
                    <input
                      type="text"
                      value={vaultPath}
                      onChange={(e) => setVaultPath(e.target.value)}
                      placeholder="/path/to/your/obsidian/vault"
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 3: Execute */}
          {selectedIds.size > 0 && (
            <Button onClick={handleExport} disabled={isExporting} className="gap-2">
              {isExporting && <Spinner size="sm" />}
              Export {selectedIds.size} recording{selectedIds.size > 1 ? "s" : ""}
            </Button>
          )}
        </>
      )}

      {/* Export progress / results */}
      {hasResults && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              {isExporting
                ? `Processing ${currentIndex + 1}/${results.length}...`
                : "Export complete"}
            </h2>
            {!isExporting && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setResults([]);
                  setSelectedIds(new Set());
                }}
              >
                Export more
              </Button>
            )}
          </div>

          {results.map((result) => (
            <ExportResultCard key={result.recordingId} result={result} />
          ))}
        </div>
      )}
    </div>
  );
}

function ExportResultCard({ result }: { result: ExportResult }) {
  const [showPreview, setShowPreview] = useState(false);

  if (result.status === "pending") {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <Spinner size="sm" />
          <span className="text-sm text-zinc-500">
            Recording #{result.recordingId} — exporting...
          </span>
        </div>
      </Card>
    );
  }

  if (result.status === "error") {
    return (
      <Card className="border-red-200 p-4 dark:border-red-900">
        <p className="text-sm font-medium text-red-700 dark:text-red-400">
          Recording #{result.recordingId} — failed
        </p>
        <p className="mt-1 text-xs text-red-500">{result.error}</p>
      </Card>
    );
  }

  const data = result.data;
  if (!data) return null;

  const previewLines = data.markdown_content.split("\n").slice(0, 50).join("\n");
  const filename = data.file_path.split("/").pop() ?? `recording-${result.recordingId}.md`;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {filename}
        </p>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? "Hide" : "Preview"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => exportApi.downloadMarkdown(filename, data.markdown_content)}
          >
            Download .md
          </Button>
        </div>
      </div>

      {showPreview && (
        <pre className="max-h-80 overflow-auto rounded-lg bg-zinc-50 p-4 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          {previewLines}
        </pre>
      )}
    </Card>
  );
}
