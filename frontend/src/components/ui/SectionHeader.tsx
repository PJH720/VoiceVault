import { cn } from "@/lib/cn";

interface SectionHeaderProps {
  /** Three-digit section number e.g. "001" */
  num?: string;
  /** Section type label e.g. "INTRODUCTION" */
  category?: string;
  /** Main heading text */
  title: string;
  /** Optional subtitle/description */
  desc?: string;
  className?: string;
}

/**
 * OpenClaw-inspired brutalist section header.
 *
 * Renders:
 *   // 001        ← dim num with // prefix (font-mono)
 *   SECTION TITLE ← bold uppercase heading
 *   description   ← muted body text
 */
export function SectionHeader({ num, category, title, desc, className }: SectionHeaderProps) {
  return (
    <div className={cn("space-y-1", className)}>
      {(num || category) && (
        <p
          className="font-mono text-[10px] uppercase tracking-widest"
          style={{ color: "var(--fg-3)" }}
        >
          {num ? `// ${num}` : "//"}
          {category && <span className="ml-2">{category}</span>}
        </p>
      )}
      <h2
        className="font-mono text-sm font-bold uppercase tracking-wider"
        style={{ color: "var(--fg)" }}
      >
        {title}
      </h2>
      {desc && (
        <p className="text-xs" style={{ color: "var(--fg-2)" }}>
          {desc}
        </p>
      )}
    </div>
  );
}

/** Inline divider with label: ─── LABEL ─── */
export function SectionDivider({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1" style={{ background: "var(--border)" }} />
      {label && (
        <span
          className="font-mono text-[10px] uppercase tracking-widest"
          style={{ color: "var(--fg-3)" }}
        >
          {label}
        </span>
      )}
      <div className="h-px flex-1" style={{ background: "var(--border)" }} />
    </div>
  );
}

/** Page-level title row — matches header.tsx style */
export function PageTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1
      className="font-mono text-lg font-bold uppercase tracking-wider"
      style={{ color: "var(--fg)" }}
    >
      {children}
    </h1>
  );
}
