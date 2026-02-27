"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import {
  Button,
  Badge,
  Card,
  SectionHeader,
  MetricCard,
  DataTable,
  StatusCell,
  CodeBlock,
  AlertCallout,
  NavigationTabs,
  TimelineEntry,
  CollapsibleSection,
  EmptyState,
  ErrorState,
  Skeleton,
  Spinner,
} from "@/components/ui";
import type { Column } from "@/components/ui";

if (process.env.NODE_ENV !== "development") {
  notFound();
}

/* ── Sample data for DataTable ── */
interface SampleRow {
  id: string;
  name: string;
  status: string;
  [key: string]: unknown;
}

const sampleColumns: Column<SampleRow>[] = [
  { key: "id", header: "ID", width: "60px" },
  { key: "name", header: "Name" },
  {
    key: "status",
    header: "Status",
    render: (row) => (
      <StatusCell
        label={row.status}
        variant={
          row.status === "PASS"
            ? "pass"
            : row.status === "WARN"
              ? "warn"
              : "fail"
        }
      />
    ),
  },
];

const sampleData: SampleRow[] = [
  { id: "001", name: "Audio pipeline", status: "PASS" },
  { id: "002", name: "RAG indexer", status: "WARN" },
  { id: "003", name: "Export module", status: "PASS" },
];

export default function ComponentCatalog() {
  const [activeTab, setActiveTab] = useState("all");

  return (
    <div className="mx-auto max-w-5xl space-y-10 p-6">
      {/* Page header */}
      <div
        className="border-l-2 pl-4"
        style={{ borderColor: "var(--cyan)" }}
      >
        <p
          className="font-mono text-[10px] uppercase tracking-widest"
          style={{ color: "var(--fg-3)" }}
        >
          {"// DEV"}
        </p>
        <h1
          className="mt-1 font-mono text-lg font-bold uppercase tracking-wider"
          style={{ color: "var(--fg)" }}
        >
          {"$ COMPONENT.CATALOG // v0.6.0"}
        </h1>
      </div>

      {/* ── Button ── */}
      <Section title="Button">
        <div className="space-y-3">
          <p
            className="font-mono text-[10px] uppercase tracking-widest"
            style={{ color: "var(--fg-3)" }}
          >
            Variants
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="cyan">Cyan</Button>
          </div>
          <p
            className="font-mono text-[10px] uppercase tracking-widest"
            style={{ color: "var(--fg-3)" }}
          >
            Sizes
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="cyan" size="sm">Small</Button>
            <Button variant="cyan" size="md">Medium</Button>
            <Button variant="cyan" size="lg">Large</Button>
          </div>
        </div>
      </Section>

      {/* ── Badge ── */}
      <Section title="Badge">
        <div className="flex flex-wrap gap-2">
          <Badge label="Default" />
          <Badge label="Online" variant="green" dot />
          <Badge label="Warning" variant="amber" dot />
          <Badge label="Error" variant="red" />
        </div>
      </Section>

      {/* ── MetricCard ── */}
      <Section title="MetricCard">
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <MetricCard value={46} label="Passed" variant="pass" />
          <MetricCard value={6} label="Warnings" variant="warn" />
          <MetricCard value={0} label="Failed" variant="fail" />
          <MetricCard value="1.2k" label="Index" variant="info" />
          <MetricCard value="99ms" label="Time" variant="accent" />
        </div>
      </Section>

      {/* ── DataTable ── */}
      <Section title="DataTable + StatusCell">
        <DataTable columns={sampleColumns} data={sampleData} />
      </Section>

      {/* ── CodeBlock ── */}
      <Section title="CodeBlock">
        <CodeBlock
          filename="example.ts"
          code={`import { VoiceVault } from "@/core";

const vault = new VoiceVault({
  provider: "whisper",
  rag: true,
});

await vault.record();`}
        />
      </Section>

      {/* ── AlertCallout ── */}
      <Section title="AlertCallout">
        <div className="space-y-2">
          <AlertCallout variant="info" title="Information">
            RAG index is being rebuilt. This may take a few minutes.
          </AlertCallout>
          <AlertCallout variant="success" title="Export complete">
            File saved to /vault/notes/recording-001.md
          </AlertCallout>
          <AlertCallout variant="warn" title="Low confidence">
            Transcription confidence below 60% for segment 3.
          </AlertCallout>
          <AlertCallout variant="error" title="Connection lost">
            WebSocket disconnected. Attempting reconnect…
          </AlertCallout>
        </div>
      </Section>

      {/* ── NavigationTabs ── */}
      <Section title="NavigationTabs">
        <NavigationTabs
          tabs={[
            { label: "All", value: "all", count: 12 },
            { label: "Active", value: "active", count: 3 },
            { label: "Archived", value: "archived" },
          ]}
          active={activeTab}
          onChange={setActiveTab}
        />
      </Section>

      {/* ── TimelineEntry ── */}
      <Section title="TimelineEntry">
        <div>
          <TimelineEntry
            date="2026-02-26 14:30"
            badge="EXPORT"
            badgeVariant="pass"
            description="Recording #12 exported to Obsidian vault"
          />
          <TimelineEntry
            date="2026-02-26 13:15"
            badge="RECORD"
            badgeVariant="info"
            description="New recording started — 45 min session"
          />
          <TimelineEntry
            date="2026-02-26 10:00"
            badge="ERROR"
            badgeVariant="fail"
            description="WebSocket connection timed out"
            isLast
          />
        </div>
      </Section>

      {/* ── CollapsibleSection ── */}
      <Section title="CollapsibleSection">
        <div className="space-y-0">
          <CollapsibleSection title="Open by default" defaultOpen>
            <Card className="p-3">
              <p className="text-xs" style={{ color: "var(--fg-2)" }}>
                This section starts open. Click the header to collapse.
              </p>
            </Card>
          </CollapsibleSection>
          <CollapsibleSection title="Closed by default">
            <Card className="p-3">
              <p className="text-xs" style={{ color: "var(--fg-2)" }}>
                This section starts closed. Click the header to expand.
              </p>
            </Card>
          </CollapsibleSection>
        </div>
      </Section>

      {/* ── EmptyState ── */}
      <Section title="EmptyState">
        <EmptyState
          title="No recordings yet"
          description="Start your first recording to see data here."
        />
      </Section>

      {/* ── ErrorState ── */}
      <Section title="ErrorState">
        <ErrorState
          title="Failed to load recordings"
          error={new Error("Network timeout — server unreachable")}
          onRetry={() => {}}
        />
      </Section>

      {/* ── Skeleton ── */}
      <Section title="Skeleton">
        <div className="space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-32" />
        </div>
      </Section>

      {/* ── Spinner ── */}
      <Section title="Spinner">
        <div className="flex items-center gap-4">
          <Spinner size="sm" />
          <Spinner size="md" variant="cyan" />
          <Spinner size="lg" variant="green" />
        </div>
      </Section>
    </div>
  );
}

/* ── Section wrapper ── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <SectionHeader title={title} />
      <div
        className="border p-4"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        {children}
      </div>
    </section>
  );
}
