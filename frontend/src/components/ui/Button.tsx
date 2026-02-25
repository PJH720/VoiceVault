import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "cyan";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, string> = {
  // Brutalist primary — solid white on dark, hard border
  primary: [
    "border font-mono uppercase tracking-widest",
    "text-[var(--bg)] bg-[var(--fg)]",
    "border-[var(--fg)]",
    "hover:bg-[var(--fg-2)] hover:border-[var(--fg-2)]",
    "active:translate-x-[2px] active:translate-y-[2px]",
    "disabled:bg-[var(--surface-3)] disabled:text-[var(--fg-3)] disabled:border-[var(--border-2)]",
  ].join(" "),

  // Secondary — outlined
  secondary: [
    "border font-mono uppercase tracking-widest",
    "text-[var(--fg)] bg-transparent",
    "border-[var(--border-2)]",
    "hover:border-[var(--fg-2)] hover:bg-[var(--surface-2)]",
    "active:translate-x-[1px] active:translate-y-[1px]",
    "disabled:text-[var(--fg-3)] disabled:border-[var(--border)]",
  ].join(" "),

  // Ghost — no border, subtle
  ghost: [
    "font-mono uppercase tracking-widest",
    "text-[var(--fg-2)] bg-transparent",
    "hover:text-[var(--fg)] hover:bg-[var(--surface-2)]",
    "disabled:text-[var(--fg-3)]",
  ].join(" "),

  // Danger — for destructive / stop actions
  danger: [
    "border font-mono uppercase tracking-widest",
    "text-[var(--red)] bg-[var(--red-dim)]",
    "border-[var(--red)]",
    "hover:bg-[var(--red)] hover:text-[var(--bg)]",
    "active:translate-x-[2px] active:translate-y-[2px]",
    "disabled:opacity-40",
  ].join(" "),

  // Cyan — for primary audio/record action
  cyan: [
    "border font-mono uppercase tracking-widest",
    "text-[var(--cyan)] bg-[var(--cyan-dim)]",
    "border-[var(--cyan)]",
    "hover:bg-[var(--cyan)] hover:text-[var(--bg)]",
    "active:translate-x-[2px] active:translate-y-[2px]",
    "disabled:opacity-40",
  ].join(" "),
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-7 px-3 text-[10px]",
  md: "h-9 px-4 text-xs",
  lg: "h-11 px-6 text-sm",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center transition-all duration-75",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--cyan)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg)]",
        "disabled:pointer-events-none",
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      disabled={disabled}
      {...props}
    />
  ),
);

Button.displayName = "Button";

export { Button, type ButtonProps };
