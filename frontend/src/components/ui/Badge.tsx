import { cn } from "@/lib/cn";

type BadgeVariant = "default" | "cyan" | "green" | "amber" | "red" | "purple";

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  /** Show a live pulsing dot before the label */
  dot?: boolean;
  className?: string;
}

const variantMap: Record<BadgeVariant, { color: string; bg: string; dot?: string }> = {
  default: { color: "var(--fg-2)",  bg: "var(--surface-3)" },
  cyan:    { color: "var(--cyan)",  bg: "var(--cyan-dim)",  dot: "var(--cyan)" },
  green:   { color: "var(--green)", bg: "var(--green-dim)", dot: "var(--green)" },
  amber:   { color: "var(--amber)", bg: "var(--amber-dim)", dot: "var(--amber)" },
  red:     { color: "var(--red)",   bg: "var(--red-dim)",   dot: "var(--red)" },
  purple:  { color: "var(--purple)",bg: "var(--purple-dim)" },
};

export function Badge({ label, variant = "default", dot, className }: BadgeProps) {
  const { color, bg, dot: dotColor } = variantMap[variant];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest",
        className,
      )}
      style={{ color, background: bg, borderColor: color + "40" }}
    >
      {dot && dotColor && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{
            background: dotColor,
            animation: "rec-pulse 1.4s ease-in-out infinite",
          }}
        />
      )}
      {label}
    </span>
  );
}

/* ── Stat box — `30/49 SKILLS READY` style ── */
interface StatBadgeProps {
  value: string;
  label: string;
  variant?: BadgeVariant;
}

export function StatBadge({ value, label, variant = "default" }: StatBadgeProps) {
  const { color } = variantMap[variant];
  return (
    <div
      className="border px-3 py-2 text-center font-mono"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <span className="block text-sm font-bold" style={{ color }}>{value}</span>
      <span
        className="block text-[10px] uppercase tracking-widest"
        style={{ color: "var(--fg-3)" }}
      >
        {label}
      </span>
    </div>
  );
}
