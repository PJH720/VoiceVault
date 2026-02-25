import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

/* ── Base Card — brutalist: hard border, zero radius, dark surface ── */
const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("border p-4", className)}
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      {...props}
    />
  ),
);
Card.displayName = "Card";

/* ── Card with left accent stripe ── */
interface AccentCardProps extends HTMLAttributes<HTMLDivElement> {
  accent?: "cyan" | "green" | "amber" | "red" | "purple";
}

const AccentCard = forwardRef<HTMLDivElement, AccentCardProps>(
  ({ className, accent = "cyan", ...props }, ref) => {
    const colorMap = {
      cyan:   "var(--cyan)",
      green:  "var(--green)",
      amber:  "var(--amber)",
      red:    "var(--red)",
      purple: "var(--purple)",
    };
    return (
      <div
        ref={ref}
        className={cn("border border-l-2 p-4", className)}
        style={{
          background:       "var(--surface)",
          borderColor:      "var(--border)",
          borderLeftColor:  colorMap[accent],
        }}
        {...props}
      />
    );
  },
);
AccentCard.displayName = "AccentCard";

/* ── Sub-components ── */
const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("mb-3 flex items-center justify-between", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("font-mono text-xs font-bold uppercase tracking-widest", className)}
      style={{ color: "var(--fg-2)" }}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("text-sm leading-relaxed", className)}
      style={{ color: "var(--fg-2)" }}
      {...props}
    />
  ),
);
CardContent.displayName = "CardContent";

const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("mt-3 border-t pt-3", className)}
      style={{ borderColor: "var(--border)" }}
      {...props}
    />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, AccentCard, CardHeader, CardTitle, CardContent, CardFooter };
