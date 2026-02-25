import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";

interface ErrorStateProps {
  title?: string;
  error: unknown;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Error",
  error,
  onRetry,
  className,
}: ErrorStateProps) {
  const message =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : "An unexpected error occurred.";

  return (
    <div
      role="alert"
      className={cn("border-l-2 p-4", className)}
      style={{
        background:      "var(--red-dim)",
        borderColor:     "var(--border)",
        borderLeftColor: "var(--red)",
      }}
    >
      <p
        className="font-mono text-[10px] font-bold uppercase tracking-widest"
        style={{ color: "var(--red)" }}
      >
        ⚠ {title}
      </p>
      <p className="mt-1 text-xs" style={{ color: "var(--fg-2)" }}>
        {message}
      </p>
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={onRetry}
        >
          Retry
        </Button>
      )}
    </div>
  );
}

/** Inline banner variants for processing, success, warning, error */
export type BannerVariant = "info" | "success" | "warning" | "error";

const bannerStyles: Record<
  BannerVariant,
  { bg: string; borderLeft: string; label: string; labelColor: string }
> = {
  info: {
    bg: "var(--cyan-dim)",
    borderLeft: "var(--cyan)",
    label: "INFO",
    labelColor: "var(--cyan)",
  },
  success: {
    bg: "var(--green-dim)",
    borderLeft: "var(--green)",
    label: "OK",
    labelColor: "var(--green)",
  },
  warning: {
    bg: "var(--amber-dim)",
    borderLeft: "var(--amber)",
    label: "WARN",
    labelColor: "var(--amber)",
  },
  error: {
    bg: "var(--red-dim)",
    borderLeft: "var(--red)",
    label: "ERR",
    labelColor: "var(--red)",
  },
};

interface BannerProps {
  variant: BannerVariant;
  children: React.ReactNode;
  className?: string;
}

export function Banner({ variant, children, className }: BannerProps) {
  const { bg, borderLeft, label, labelColor } = bannerStyles[variant];
  return (
    <div
      className={cn("flex items-start gap-3 border border-l-2 p-3", className)}
      style={{
        background:      bg,
        borderColor:     "var(--border)",
        borderLeftColor: borderLeft,
      }}
    >
      <span
        className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-widest"
        style={{ color: labelColor }}
      >
        {label}
      </span>
      <span className="text-xs leading-relaxed" style={{ color: "var(--fg-2)" }}>
        {children}
      </span>
    </div>
  );
}
