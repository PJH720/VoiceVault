"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

interface CodeBlockProps {
  code: string;
  filename?: string;
  language?: string;
  className?: string;
}

export function CodeBlock({ code, filename, language, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className={cn("border", className)}
      style={{
        background: "var(--surface-2)",
        borderColor: "var(--border-2)",
      }}
    >
      {/* Header bar */}
      {(filename || true) && (
        <div
          className="flex items-center justify-between border-b px-3 py-1.5"
          style={{ borderColor: "var(--border-2)" }}
        >
          <span
            className="font-mono text-[10px] uppercase tracking-widest"
            style={{ color: "var(--fg-3)" }}
          >
            {filename ?? language ?? "code"}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy code to clipboard"
            className="font-mono text-[10px] uppercase tracking-widest transition-colors focus-visible:ring-1 focus-visible:ring-[var(--cyan)]"
            style={{ color: copied ? "var(--green)" : "var(--fg-3)" }}
          >
            {copied ? "✓" : "COPY"}
          </button>
        </div>
      )}

      {/* Code content */}
      <pre className="overflow-x-auto p-3">
        <code
          className="font-mono text-xs whitespace-pre"
          style={{ color: "var(--fg)" }}
        >
          {code}
        </code>
      </pre>
    </div>
  );
}
