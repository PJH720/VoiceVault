"use client";

import { type KeyboardEvent, type ReactNode, useId, useRef } from "react";
import { cn } from "@/lib/cn";

export type SummaryTab = "minute" | "hour";

interface TabConfig {
  value: SummaryTab;
  label: string;
  count?: number;
}

interface SummaryTabsProps {
  value: SummaryTab;
  onChange: (tab: SummaryTab) => void;
  minuteCount?: number;
  hourCount?: number;
  children: ReactNode;
}

const TABS: TabConfig[] = [
  { value: "minute", label: "Minute summaries" },
  { value: "hour", label: "Hour summaries" },
];

export function SummaryTabs({
  value,
  onChange,
  minuteCount,
  hourCount,
  children,
}: SummaryTabsProps) {
  const id = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const counts: Record<SummaryTab, number | undefined> = {
    minute: minuteCount,
    hour: hourCount,
  };

  function handleKeyDown(e: KeyboardEvent, index: number) {
    let next: number;

    switch (e.key) {
      case "ArrowRight":
        next = (index + 1) % TABS.length;
        break;
      case "ArrowLeft":
        next = (index - 1 + TABS.length) % TABS.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = TABS.length - 1;
        break;
      default:
        return;
    }

    e.preventDefault();
    const tab = TABS[next];
    if (tab) {
      onChange(tab.value);
      tabRefs.current[next]?.focus();
    }
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Summary type"
        className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800"
      >
        {TABS.map((tab, i) => {
          const isActive = value === tab.value;
          const count = counts[tab.value];
          return (
            <button
              key={tab.value}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              id={`${id}-tab-${tab.value}`}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={`${id}-panel-${tab.value}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(tab.value)}
              onKeyDown={(e) => handleKeyDown(e, i)}
              className={cn(
                "-mb-px px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2",
                isActive
                  ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300",
              )}
            >
              {tab.label}
              {count !== undefined && (
                <span
                  className={cn(
                    "ml-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-xs",
                    isActive
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        id={`${id}-panel-${value}`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${value}`}
        tabIndex={0}
        className="pt-4"
      >
        {children}
      </div>
    </div>
  );
}
