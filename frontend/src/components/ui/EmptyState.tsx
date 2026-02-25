import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center border py-12 text-center",
        className,
      )}
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      {icon && (
        <div className="mb-4" style={{ color: "var(--fg-3)" }}>
          {icon}
        </div>
      )}
      <p
        className="font-mono text-xs font-bold uppercase tracking-widest"
        style={{ color: "var(--fg-2)" }}
      >
        {title}
      </p>
      {description && (
        <p
          className="mt-2 max-w-sm text-xs leading-relaxed"
          style={{ color: "var(--fg-3)" }}
        >
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** Inline empty variant — no border/bg, just centered text */
export function InlineEmpty({ message }: { message: string }) {
  return (
    <p
      className="py-8 text-center font-mono text-xs uppercase tracking-widest"
      style={{ color: "var(--fg-3)" }}
    >
      {message}
    </p>
  );
}
