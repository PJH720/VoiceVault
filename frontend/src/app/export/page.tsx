"use client";

import { Suspense, useState, useMemo } from "react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { AlertCallout } from "@/components/ui/AlertCallout";
import { TimelineEntry } from "@/components/ui/TimelineEntry";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { useRecordings } from "@/hooks/useRecordings";
import { exportApi } from "@/lib/api/export";
import type { RecordingResponse, ObsidianExportResponse } from "@/types/api";

interface ExportHistoryItem {
  recordingId: number;
  title: string;
  date: string;
  status: "success" | "error";
  error?: string;
}

export default function ExportPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl space-y-6 p-6">
          <Skeleton className="h-6 w-48" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      }
    >
      <ExportContent />
    </Suspense>
  );
}

function ExportContent() {
  const { data: recordings, isLoading, error, refetch } = useRecordings({ sort: "newest" });

  const [selectedId, setSelectedId] = useState<string>("");
  const [vaultPath, setVaultPath] = useState("");
  const [includeTags, setIncludeTags] = useState(true);
  const [includeTimestamps, setIncludeTimestamps] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ObsidianExportResponse | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [history, setHistory] = useState<ExportHistoryItem[]>([]);

  const selectedRecording = useMemo(
    () => recordings?.find((r) => r.id === Number(selectedId)),
    [recordings, selectedId],
  );

  const previewContent = useMemo(() => {
    if (exportResult) return exportResult.markdown_content;
    if (!selectedRecording) return "# Select a recording to preview\n\nChoose a recording from the left panel.";
    return [
      `# ${selectedRecording.title ?? `Recording #${selectedRecording.id}`}`,
      "",
      `**Date:** ${new Date(selectedRecording.started_at).toLocaleDateString()}`,
      `**Duration:** ${selectedRecording.total_minutes}m`,
      `**Status:** ${selectedRecording.status}`,
      "",
      includeTags ? "**Tags:** (generated on export)" : "",
      includeTimestamps ? "**Timestamps:** included" : "",
      "",
      "> Full content will be generated on export.",
    ].filter(Boolean).join("\n");
  }, [selectedRecording, exportResult, includeTags, includeTimestamps]);

  async function handleExport() {
    if (!selectedId) return;
    const id = Number(selectedId);

    setIsExporting(true);
    setExportResult(null);
    setExportError(null);

    try {
      const data = await exportApi.exportRecording(id, {
        format: "obsidian",
        include_transcript: includeTimestamps,
        vault_path: vaultPath || undefined,
      });
      setExportResult(data);
      setHistory((prev) => [
        {
          recordingId: id,
          title: selectedRecording?.title ?? `Recording #${id}`,
          date: new Date().toLocaleString(),
          status: "success",
        },
        ...prev,
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed";
      setExportError(message);
      setHistory((prev) => [
        {
          recordingId: id,
          title: selectedRecording?.title ?? `Recording #${id}`,
          date: new Date().toLocaleString(),
          status: "error",
          error: message,
        },
        ...prev,
      ]);
    } finally {
      setIsExporting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <Skeleton className="h-6 w-48" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <SectionHeader title="EXPORT" />
        <ErrorState title="Failed to load recordings" error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  if (!recordings || recordings.length === 0) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <SectionHeader title="EXPORT" />
        <EmptyState title="No recordings" description="Start a recording to export it later." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <SectionHeader title="EXPORT" desc="One-click Obsidian-compatible Markdown export" />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left: Configure */}
        <Card className="space-y-4 p-4">
          <h3
            className="font-mono text-xs font-bold uppercase tracking-widest"
            style={{ color: "var(--fg-2)" }}
          >
            Configure Export
          </h3>

          {/* Recording selector */}
          <div className="space-y-1">
            <label
              className="font-mono text-[10px] uppercase tracking-widest"
              style={{ color: "var(--fg-3)" }}
            >
              Recording
            </label>
            <select
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setExportResult(null);
                setExportError(null);
              }}
              className="w-full border bg-transparent px-3 py-1.5 font-mono text-xs focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--cyan)]"
              style={{
                borderColor: "var(--border-2)",
                color: "var(--fg)",
              }}
            >
              <option value="">Select recording…</option>
              {recordings.map((rec: RecordingResponse) => (
                <option key={rec.id} value={String(rec.id)}>
                  {rec.title ?? `Recording #${rec.id}`} — {new Date(rec.started_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>

          {/* Vault path */}
          <div className="space-y-1">
            <label
              className="font-mono text-[10px] uppercase tracking-widest"
              style={{ color: "var(--fg-3)" }}
            >
              Vault Path
            </label>
            <input
              type="text"
              value={vaultPath}
              onChange={(e) => setVaultPath(e.target.value)}
              placeholder="/path/to/obsidian/vault"
              className="w-full border bg-transparent px-3 py-1.5 font-mono text-xs placeholder:text-[var(--fg-3)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--cyan)]"
              style={{
                borderColor: "var(--border-2)",
                color: "var(--fg)",
              }}
            />
          </div>

          {/* Checkboxes */}
          <label className="flex items-center gap-2 font-mono text-xs" style={{ color: "var(--fg-2)" }}>
            <input
              type="checkbox"
              checked={includeTags}
              onChange={(e) => setIncludeTags(e.target.checked)}
              className="accent-[var(--cyan)]"
            />
            Include tags
          </label>
          <label className="flex items-center gap-2 font-mono text-xs" style={{ color: "var(--fg-2)" }}>
            <input
              type="checkbox"
              checked={includeTimestamps}
              onChange={(e) => setIncludeTimestamps(e.target.checked)}
              className="accent-[var(--cyan)]"
            />
            Include timestamps
          </label>

          {/* Export button */}
          <Button
            variant="cyan"
            onClick={handleExport}
            disabled={!selectedId || isExporting}
            className="w-full gap-2"
          >
            {isExporting && <Spinner size="sm" />}
            Export
          </Button>
        </Card>

        {/* Right: Preview */}
        <div className="space-y-2">
          <h3
            className="font-mono text-xs font-bold uppercase tracking-widest"
            style={{ color: "var(--fg-2)" }}
          >
            Preview
          </h3>
          <CodeBlock
            code={previewContent}
            filename="output.md"
            language="markdown"
          />
          {exportResult && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const filename = exportResult.file_path.split("/").pop() ?? "export.md";
                exportApi.downloadMarkdown(filename, exportResult.markdown_content);
              }}
            >
              Download .md
            </Button>
          )}
        </div>
      </div>

      {/* Status alerts */}
      {isExporting && (
        <AlertCallout variant="info" title="Exporting">
          Generating Obsidian-compatible Markdown…
        </AlertCallout>
      )}
      {exportError && (
        <AlertCallout variant="error" title="Export failed">
          {exportError}
        </AlertCallout>
      )}
      {exportResult && !isExporting && (
        <AlertCallout variant="success" title="Export complete">
          File saved to {exportResult.file_path}
        </AlertCallout>
      )}

      {/* Export history */}
      {history.length > 0 && (
        <div className="space-y-2">
          <h3
            className="font-mono text-xs font-bold uppercase tracking-widest"
            style={{ color: "var(--fg-2)" }}
          >
            Export History
          </h3>
          {history.map((item, i) => (
            <TimelineEntry
              key={`${item.recordingId}-${item.date}`}
              date={item.date}
              badge="EXPORT"
              badgeVariant={item.status === "success" ? "pass" : "fail"}
              description={
                item.status === "success"
                  ? `${item.title} exported successfully`
                  : `${item.title} — ${item.error}`
              }
              isLast={i === history.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
