"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { useRAGSearch } from "@/hooks/useRAGSearch";
import type { RAGQueryRequest, RAGSource } from "@/types/api";

const CATEGORY_OPTIONS = ["All", "lecture", "conversation", "memo", "other"] as const;

export default function RAGPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      }
    >
      <RAGContent />
    </Suspense>
  );
}

function RAGContent() {
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [category, setCategory] = useState<string>("All");

  const { search, data, isPending, isError, error, reset } = useRAGSearch();

  function handleSearch() {
    if (!query.trim()) return;

    const request: RAGQueryRequest = {
      query: query.trim(),
      top_k: 5,
      min_similarity: 0.3,
    };

    if (dateFrom) request.date_from = dateFrom;
    if (dateTo) request.date_to = dateTo;
    if (category !== "All") request.category = category;

    search(request);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">RAG Search</h1>

      {/* Query input */}
      <div className="space-y-4">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask a question about your recordings..."
          rows={3}
          className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              handleSearch();
            }
          }}
        />

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              From
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              To
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt === "All" ? "All categories" : opt}
                </option>
              ))}
            </select>
          </div>

          <Button
            onClick={handleSearch}
            disabled={isPending || !query.trim()}
            className="gap-2"
          >
            {isPending && <Spinner size="sm" />}
            Search
          </Button>
          {(data || isError) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                reset();
                setQuery("");
                setDateFrom("");
                setDateTo("");
                setCategory("All");
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Error */}
      {isError && (
        <ErrorState
          title="Search failed"
          error={error}
          onRetry={handleSearch}
        />
      )}

      {/* Results */}
      {data && (
        <div className="space-y-4">
          {/* Answer */}
          <Card>
            <CardContent>
              <p className="whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
                {data.answer}
              </p>
              {data.query_time_ms > 0 && (
                <p className="mt-2 text-xs text-zinc-400">
                  {data.query_time_ms}ms &middot; {data.model_used}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Sources */}
          {data.sources && data.sources.length > 0 ? (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Sources ({data.sources.length})
              </h2>
              {data.sources.map((source, i) => (
                <SourceCard key={`${source.recording_id}-${source.minute_index}-${i}`} source={source} />
              ))}
            </div>
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
  const truncatedText =
    source.summary_text.length > 200
      ? source.summary_text.slice(0, 200) + "..."
      : source.summary_text;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            {truncatedText}
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
            <span>{source.date}</span>
            {source.category && (
              <>
                <span>&middot;</span>
                <span className="capitalize">{source.category}</span>
              </>
            )}
            <span>&middot;</span>
            <Link
              href={`/summaries?recording=${source.recording_id}`}
              className="text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              View recording
            </Link>
          </div>
        </div>
        <span
          className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
          title="Similarity score"
        >
          {similarityPct}%
        </span>
      </div>
    </Card>
  );
}
