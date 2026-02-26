"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

export function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
  className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <div className={cn("border-b", className)} style={{ borderColor: "var(--border)" }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-2 py-2 font-mono text-xs uppercase tracking-widest transition-colors focus-visible:ring-1 focus-visible:ring-[var(--cyan)]"
        style={{ color: "var(--fg-2)" }}
        aria-expanded={open}
        aria-controls={contentId}
      >
        <span className="text-[10px]" style={{ color: "var(--fg-3)" }}>
          {open ? "▼" : "▶"}
        </span>
        {title}
      </button>
      {open && <div id={contentId} className="pb-3">{children}</div>}
    </div>
  );
}
