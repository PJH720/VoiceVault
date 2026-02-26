"use client";

import Link from "next/link";
import { useRecordings } from "@/hooks/useRecordings";
import { MetricCard } from "@/components/ui/MetricCard";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

const NAV_ITEMS = [
  {
    href: "/recording",
    label: "REC",
    fullLabel: "Recording",
    desc: "Capture + live transcription via WebSocket",
    accent: "var(--red)",
    dim: "var(--red-dim)",
    num: "01",
  },
  {
    href: "/summaries",
    label: "SUM",
    fullLabel: "Summaries",
    desc: "Minute & hour AI summaries with keyword extraction",
    accent: "var(--cyan)",
    dim: "var(--cyan-dim)",
    num: "02",
  },
  {
    href: "/rag",
    label: "RAG",
    fullLabel: "Search",
    desc: "Natural-language search across all transcriptions",
    accent: "var(--green)",
    dim: "var(--green-dim)",
    num: "03",
  },
  {
    href: "/export",
    label: "EXP",
    fullLabel: "Export",
    desc: "One-click Obsidian-compatible Markdown export",
    accent: "var(--purple)",
    dim: "var(--purple-dim)",
    num: "04",
  },
] as const;

export default function Home() {
  const { data: recordings } = useRecordings({ sort: "newest" });

  const totalRecordings = recordings?.length ?? 0;
  const completedCount = recordings?.filter((r) => r.status === "completed").length ?? 0;

  const recent5 = recordings?.slice(0, 5) ?? [];

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col justify-between py-12">

      {/* ── Hero ── */}
      <section className="space-y-6">
        {/* Terminal prompt header */}
        <div
          className="border-l-2 pl-4"
          style={{ borderColor: "var(--cyan)" }}
        >
          <p className="text-section-label">
            $ SYSTEM.INIT // VoiceVault
          </p>
          <h1
            className="mt-2 font-mono text-4xl font-bold uppercase tracking-tight sm:text-5xl"
            style={{ color: "var(--fg)" }}
          >
            Voice<span style={{ color: "var(--cyan)" }}>Vault</span>
            <span
              className="ml-1 inline-block h-[0.9em] w-[3px] align-middle"
              style={{
                background: "var(--cyan)",
                animation: "cursor-blink 1s step-end infinite",
              }}
            />
          </h1>
          <p
            className="mt-3 max-w-md font-mono text-sm"
            style={{ color: "var(--fg-2)" }}
          >
            AI-powered voice recorder — transcribe, summarize, classify,
            and search your recordings.
          </p>
        </div>

        {/* MetricCards row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <MetricCard value={totalRecordings} label="Recordings" variant="info" />
          <MetricCard value={completedCount} label="Summaries" variant="pass" />
          <MetricCard value={totalRecordings > 0 ? "ON" : "—"} label="Index" />
        </div>

        {/* Status badges */}
        <div className="flex flex-wrap gap-2">
          <Badge label="Backend" variant="green" dot />
          <Badge label="WebSocket" variant="cyan" dot />
          <Badge label="RAG" variant="green" dot />
        </div>

        {/* Stat row */}
        <div
          className="flex flex-wrap gap-0 border font-mono text-xs"
          style={{ borderColor: "var(--border)" }}
        >
          {[
            { value: "WS", label: "REAL-TIME" },
            { value: "AI", label: "SUMMARIES" },
            { value: "RAG", label: "SEARCH" },
            { value: "MD", label: "OBSIDIAN" },
          ].map(({ value, label }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-0.5 border-r px-4 py-3 last:border-r-0"
              style={{ borderColor: "var(--border)" }}
            >
              <span
                className="text-base font-bold"
                style={{ color: "var(--cyan)" }}
              >
                {value}
              </span>
              <span className="text-caption">
                {label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Recent recordings ── */}
      {recent5.length > 0 && (
        <section className="mt-6 space-y-2">
          <p className="text-prompt">
            // RECENT
          </p>
          <div className="space-y-1">
            {recent5.map((rec) => (
              <Link
                key={rec.id}
                href={`/summaries?recording=${rec.id}`}
                className="flex items-center justify-between border p-2 transition-colors hover:bg-[var(--surface-2)] focus-visible:ring-1 focus-visible:ring-[var(--cyan)]"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--surface)",
                }}
              >
                <span className="truncate font-mono text-xs" style={{ color: "var(--fg)" }}>
                  {rec.title ?? `Recording #${rec.id}`}
                </span>
                <span className="shrink-0 font-mono text-[10px]" style={{ color: "var(--fg-3)" }}>
                  {new Date(rec.started_at).toLocaleDateString()}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Feature grid ── */}
      <section className="mt-10 space-y-2">
        <p className="text-prompt">
          // MODULES
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {NAV_ITEMS.map(({ href, label, fullLabel, desc, accent, dim, num }) => (
            <Link
              key={href}
              href={href}
              className="group block border p-4 transition-all duration-100"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = accent;
                (e.currentTarget as HTMLElement).style.background = dim;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                (e.currentTarget as HTMLElement).style.background = "var(--surface)";
              }}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-caption">
                      // {num}
                    </span>
                    <span
                      className="font-mono text-xs font-bold uppercase tracking-widest"
                      style={{ color: accent }}
                    >
                      {label}
                    </span>
                  </div>
                  <p
                    className="font-mono text-sm font-semibold uppercase tracking-wide"
                    style={{ color: "var(--fg)" }}
                  >
                    {fullLabel}
                  </p>
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: "var(--fg-2)" }}
                  >
                    {desc}
                  </p>
                </div>
                <span
                  className="mt-0.5 shrink-0 text-caption transition-transform duration-100 group-hover:translate-x-0.5"
                >
                  →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        className="mt-10 border-t pt-4 text-caption"
        style={{ borderColor: "var(--border)" }}
      >
        <span>VOICEVAULT · AI VOICE INTELLIGENCE · v0.6.0</span>
      </footer>
    </div>
  );
}
