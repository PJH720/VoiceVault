import { cn } from "@/lib/cn";

type MetricVariant = "default" | "pass" | "warn" | "fail" | "info" | "accent";

interface MetricCardProps {
  value: string | number;
  label: string;
  variant?: MetricVariant;
  sublabel?: string;
  className?: string;
}

const variantStyles: Record<
  MetricVariant,
  { color: string; border: string; glow: string }
> = {
  default: {
    color: "var(--fg)",
    border: "var(--border-2)",
    glow: "none",
  },
  pass: {
    color: "var(--green)",
    border: "var(--green)",
    glow: "0 0 12px var(--green-glow)",
  },
  warn: {
    color: "var(--amber)",
    border: "var(--amber)",
    glow: "0 0 12px var(--amber-glow)",
  },
  fail: {
    color: "var(--red)",
    border: "var(--red)",
    glow: "0 0 12px var(--red-glow)",
  },
  info: {
    color: "var(--cyan)",
    border: "var(--cyan)",
    glow: "0 0 12px var(--cyan-glow)",
  },
  accent: {
    color: "var(--cyan)",
    border: "var(--cyan)",
    glow: "0 0 12px var(--cyan-glow)",
  },
};

export function MetricCard({
  value,
  label,
  variant = "default",
  sublabel,
  className,
}: MetricCardProps) {
  const { color, border, glow } = variantStyles[variant];

  return (
    <div
      className={cn(
        "group w-full border border-l-2 p-4 transition-shadow duration-100",
        className,
      )}
      style={{
        background: "var(--surface)",
        borderColor: "var(--border-2)",
        borderLeftColor: border,
      }}
      onMouseEnter={(e) => {
        if (glow !== "none") {
          (e.currentTarget as HTMLElement).style.boxShadow = glow;
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
      }}
    >
      <span
        className="block font-mono text-2xl font-bold leading-none"
        style={{ color }}
      >
        {value}
      </span>
      <span className="mt-2 block font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--fg-3)" }}>
        {label}
      </span>
      {sublabel && (
        <span className="mt-1 block text-[10px]" style={{ color: "var(--fg-3)" }}>
          {sublabel}
        </span>
      )}
    </div>
  );
}
