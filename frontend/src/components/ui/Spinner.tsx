import { cn } from "@/lib/cn";

type SpinnerSize = "sm" | "md" | "lg";
type SpinnerVariant = "default" | "cyan" | "green" | "amber";

interface SpinnerProps {
  size?: SpinnerSize;
  variant?: SpinnerVariant;
  className?: string;
}

const sizeStyles: Record<SpinnerSize, string> = {
  sm: "h-3.5 w-3.5 border",
  md: "h-5 w-5 border-[1.5px]",
  lg: "h-7 w-7 border-2",
};

const colorMap: Record<SpinnerVariant, { track: string; head: string }> = {
  default: { track: "var(--border-2)",  head: "var(--fg-2)" },
  cyan:    { track: "var(--cyan-dim)",  head: "var(--cyan)" },
  green:   { track: "var(--green-dim)", head: "var(--green)" },
  amber:   { track: "var(--amber-dim)", head: "var(--amber)" },
};

export function Spinner({ size = "md", variant = "default", className }: SpinnerProps) {
  const { track, head } = colorMap[variant];
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn("animate-spin rounded-full", sizeStyles[size], className)}
      style={{
        borderColor: track,
        borderTopColor: head,
      }}
    />
  );
}

/** Terminal-style loading row: spinner + text */
export function LoadingRow({
  text = "Loading…",
  variant,
}: {
  text?: string;
  variant?: SpinnerVariant;
}) {
  return (
    <div className="flex items-center gap-2 py-8 justify-center">
      <Spinner size="sm" variant={variant ?? "cyan"} />
      <span
        className="font-mono text-xs uppercase tracking-widest"
        style={{ color: "var(--fg-3)" }}
      >
        {text}
      </span>
    </div>
  );
}
