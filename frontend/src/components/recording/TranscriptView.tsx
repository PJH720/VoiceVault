"use client";

import { useEffect, useRef } from "react";
import type { TranscriptEntry, SummaryEntry } from "@/stores/recording";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

interface TranscriptViewProps {
  transcripts: TranscriptEntry[];
  summaries: SummaryEntry[];
  isRecording: boolean;
  className?: string;
}

/** Threshold (px) for auto-scroll: if within this distance of bottom, keep scrolling. */
const AUTO_SCROLL_THRESHOLD = 80;

export function TranscriptView({
  transcripts,
  summaries,
  isRecording,
  className,
}: TranscriptViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  // Track whether user has scrolled away from bottom
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScroll.current = distanceFromBottom < AUTO_SCROLL_THRESHOLD;
  };

  // Auto-scroll when new transcripts arrive
  useEffect(() => {
    if (shouldAutoScroll.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts.length]);

  const isEmpty = transcripts.length === 0 && summaries.length === 0;

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Live Transcript</CardTitle>
        {isRecording && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-red-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            LIVE
          </span>
        )}
      </CardHeader>

      <CardContent className="flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="max-h-80 min-h-[200px] overflow-y-auto"
        >
          {isEmpty && (
            <p className="py-8 text-center text-sm text-zinc-400">
              {isRecording
                ? "Waiting for speech…"
                : "Transcripts will appear here during recording."}
            </p>
          )}

          {/* Summaries */}
          {summaries.length > 0 && (
            <div className="mb-4 space-y-2">
              {summaries.map((s) => (
                <div
                  key={`summary-${s.minuteIndex}`}
                  className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                      Minute {s.minuteIndex + 1} Summary
                    </span>
                    {s.keywords && s.keywords.length > 0 && (
                      <div className="flex gap-1">
                        {s.keywords.slice(0, 3).map((kw) => (
                          <span
                            key={kw}
                            className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    {s.summaryText}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Transcript entries */}
          {transcripts.length > 0 && (
            <div className="space-y-1">
              {transcripts.map((t) => (
                <p key={t.id} className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                  {t.text}
                  {t.confidence != null && t.confidence < 0.5 && (
                    <span className="ml-1 text-xs text-zinc-400" title={`Confidence: ${Math.round(t.confidence * 100)}%`}>
                      (?)
                    </span>
                  )}
                </p>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
