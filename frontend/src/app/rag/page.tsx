"use client";

import { Suspense, useState, useCallback } from "react";
import Link from "next/link";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { MetricCard } from "@/components/ui/MetricCard";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AlertCallout } from "@/components/ui/AlertCallout";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useRAGSearch } from "@/hooks/useRAGSearch";
import type { RAGQueryRequest, RAGSource } from "@/types/api";

export default function RAGPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl space-y-6 p-6">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-10 w-full" />
        </div>
      }
    >
      <RAGContent />
    </Suspense>
  );
}

function RAGContent() {
  const [query, setQuery] = useState("");
  const { search, data, isPending, isError, error, reset } = useRAGSearch();

  const handleSearch = useCallback(() => {
    if (!query.trim()) return;
    const request: RAGQueryRequest = {
      query: query.trim(),
      top_k: 10,
      min_similarity: 0.3,
    };
    search(request);
  }, [query, search]);

  const topScore =
    data?.sources && data.sources.length > 0
      ? Math.max(...data.sources.map((s) => s.similarity))
      : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <SectionHeader title="RAG SEARCH" desc="Natural-language search across all transcriptions" />

      {/* Query input */}
      <div className="flex items-center gap-2">
        <span
          className="shrink-0 font-mono text-sm font-bold"
          style={{ color: "var(--cyan)" }}
        >
          &gt;
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSearch();
          }}
          placeholder="Ask a question about your recordings..."
          className="flex-1 border-b-2 bg-transparent font-mono text-sm transition-colors focus:outline-none"
          style={{
            color: "var(--fg)",
            borderColor: "var(--border-2)",
          }}
          onFocus={(e) => {
            (e.currentTarget as HTMLInputElement).style.borderColor = "var(--cyan)";
          }}
          onBlur={(e) => {
            (e.currentTarget as HTMLInputElement).style.borderColor = "var(--border-2)";
          }}
        />
        <Button
          size="sm"
          variant="cyan"
          onClick={handleSearch}
          disabled={isPending || !query.trim()}
        >
          Search
        </Button>
        {(data || isError) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              reset();
              setQuery("");
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Loading */}
      {isPending && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      )}

      {/* Error */}
      {isError && (
        <AlertCallout variant="error" title="Search failed">
          {error?.message ?? "An unexpected error occurred."}
        </AlertCallout>
      )}

      {/* Results */}
      {data && (
        <div className="space-y-4">
          {/* Metric cards */}
          <div className="grid grid-cols-3 gap-2">
            <MetricCard
              value={data.sources?.length ?? 0}
              label="Results"
              variant="info"
            />
            <MetricCard
              value={topScore !== null ? `${Math.round(topScore * 100)}%` : "—"}
              label="Top Score"
              variant="accent"
            />
            <MetricCard
              value={data.query_time_ms > 0 ? `${data.query_time_ms}ms` : "—"}
              label="Query Time"
            />
          </div>

          {/* Answer */}
          <Card className="p-4">
            <p
              className="text-xs leading-relaxed whitespace-pre-wrap"
              style={{ color: "var(--fg-2)" }}
            >
              {data.answer}
            </p>
            {data.model_used && (
              <p className="mt-2 text-[10px]" style={{ color: "var(--fg-3)" }}>
                model: {data.model_used}
              </p>
            )}
          </Card>

          {/* Source cards */}
          {data.sources && data.sources.length > 0 ? (
            data.sources.map((source, i) => (
              <SourceCard key={`${source.recording_id}-${source.minute_index}-${i}`} source={source} />
            ))
          ) : (
            <EmptyState
              title="No sources found"
              description="The answer was generated without matching source documents."
            />
          )}
        </div>
      )}

      {/* Initial empty state */}
      {!data && !isError && !isPending && (
        <EmptyState
          title="Search your recordings"
          description="Ask a natural language question to search across all your transcriptions and summaries."
        />
      )}
    </div>
  );
}

function SourceCard({ source }: { source: RAGSource }) {
  const similarityPct = Math.round(source.similarity * 100);
  const excerpt =
    source.summary_text.length > 300
      ? source.summary_text.slice(0, 300) + "..."
      : source.summary_text;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "var(--fg-3)" }}>
            {source.date}
          </span>
          {source.category && (
            <>
              <span style={{ color: "var(--fg-3)" }}>·</span>
              <span className="text-[10px] font-mono uppercase tracking-widest capitalize" style={{ color: "var(--fg-3)" }}>
                {source.category}
              </span>
            </>
          )}
        </div>
        <MetricCard
          value={`${similarityPct}%`}
          label="relevance"
          variant={similarityPct >= 70 ? "pass" : similarityPct >= 40 ? "warn" : "fail"}
          className="px-2 py-1"
        />
      </div>

      <CodeBlock code={excerpt} language="markdown" />

      <Link
        href={`/summaries?recording=${source.recording_id}`}
        className="inline-block font-mono text-[10px] uppercase tracking-widest transition-colors focus-visible:ring-1 focus-visible:ring-[var(--cyan)]"
        style={{ color: "var(--cyan)" }}
      >
        View recording →
      </Link>
    </Card>
  );
}
