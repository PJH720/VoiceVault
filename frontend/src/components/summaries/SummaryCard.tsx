"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import type { SummaryResponse, HourSummaryResponse } from "@/types/api";

// ---------------------------------------------------------------------------
// Minute summary card
// ---------------------------------------------------------------------------

interface MinuteSummaryCardProps {
  summary: SummaryResponse;
}

export function MinuteSummaryCard({ summary }: MinuteSummaryCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Minute {summary.minute_index + 1}</span>
          {summary.confidence > 0 && (
            <span className="text-xs font-normal text-zinc-400">
              {Math.round(summary.confidence * 100)}%
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap">{summary.summary_text}</p>
        {summary.keywords && summary.keywords.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {summary.keywords.map((kw) => (
              <span
                key={kw}
                className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
              >
                {kw}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Hour summary card
// ---------------------------------------------------------------------------

interface HourSummaryCardProps {
  summary: HourSummaryResponse;
}

export function HourSummaryCard({ summary }: HourSummaryCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Hour {summary.hour_index + 1}</span>
          <span className="text-xs font-normal text-zinc-400">
            {summary.token_count} tokens
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap">{summary.summary_text}</p>
        {summary.keywords && summary.keywords.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {summary.keywords.map((kw) => (
              <span
                key={kw}
                className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600 dark:bg-blue-950 dark:text-blue-400"
              >
                {kw}
              </span>
            ))}
          </div>
        )}
        {summary.model_used && (
          <p className="mt-2 text-xs text-zinc-400">
            Model: {summary.model_used}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
