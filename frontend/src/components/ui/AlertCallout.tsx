import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type AlertVariant = "info" | "warn" | "error" | "success";

interface AlertCalloutProps {
  variant: AlertVariant;
  title?: string;
  children: ReactNode;
  className?: string;
}

const variantConfig: Record<
  AlertVariant,
  { color: string; bg: string; icon: string }
> = {
  info:    { color: "var(--cyan)",  bg: "var(--cyan-dim)",  icon: "ℹ" },
  warn:    { color: "var(--amber)", bg: "var(--amber-dim)", icon: "⚠" },
  error:   { color: "var(--red)",   bg: "var(--red-dim)",   icon: "✗" },
  success: { color: "var(--green)", bg: "var(--green-dim)", icon: "✓" },
};

export function AlertCallout({
  variant,
  title,
  children,
  className,
}: AlertCalloutProps) {
  const { color, bg, icon } = variantConfig[variant];

  return (
    <div
      className={cn("border border-l-2 p-4", className)}
      style={{
        background: bg,
        borderColor: "var(--border)",
        borderLeftColor: color,
      }}
    >
      <div className="flex items-start gap-2">
        <span
          className="shrink-0 font-mono text-sm leading-none"
          style={{ color }}
          aria-hidden="true"
        >
          {icon}
        </span>
        <div className="min-w-0">
          {title && (
            <p
              className="font-mono text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--fg)" }}
            >
              {title}
            </p>
          )}
          <div
            className={cn("text-xs leading-relaxed", title && "mt-1")}
            style={{ color: "var(--fg-2)" }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
