import { cn } from "@/lib/cn";

type TimelineBadgeVariant = "default" | "info" | "warn" | "pass" | "fail";

interface TimelineEntryProps {
  date: string;
  badge: string;
  badgeVariant?: TimelineBadgeVariant;
  description: string;
  isLast?: boolean;
}

const badgeColorMap: Record<TimelineBadgeVariant, string> = {
  default: "var(--fg-2)",
  info:    "var(--cyan)",
  warn:    "var(--amber)",
  pass:    "var(--green)",
  fail:    "var(--red)",
};

export function TimelineEntry({
  date,
  badge,
  badgeVariant = "default",
  description,
  isLast = false,
}: TimelineEntryProps) {
  const badgeColor = badgeColorMap[badgeVariant];

  return (
    <div className="relative flex gap-3 pb-4">
      {/* Vertical line + dot */}
      <div className="flex flex-col items-center">
        <div
          className="mt-1.5 h-2 w-2 shrink-0 border"
          style={{
            borderColor: badgeColor,
            background: badgeColor,
          }}
        />
        {!isLast && (
          <div
            className="w-px flex-1"
            style={{ background: "var(--border-2)" }}
          />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 pb-1">
        <span
          className="block font-mono text-[10px] tracking-widest"
          style={{ color: "var(--fg-3)" }}
        >
          {date}
        </span>
        <span
          className={cn(
            "mt-0.5 inline-block border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest",
          )}
          style={{
            color: badgeColor,
            background: "var(--surface-2)",
            borderColor: badgeColor + "40",
          }}
        >
          {badge}
        </span>
        <p
          className="mt-1 text-xs leading-relaxed"
          style={{ color: "var(--fg)" }}
        >
          {description}
        </p>
      </div>
    </div>
  );
}
