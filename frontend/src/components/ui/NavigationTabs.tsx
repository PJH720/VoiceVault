import { cn } from "@/lib/cn";

interface Tab {
  label: string;
  value: string;
  count?: number;
}

interface NavigationTabsProps {
  tabs: Tab[];
  active: string;
  onChange: (value: string) => void;
  className?: string;
}

export function NavigationTabs({
  tabs,
  active,
  onChange,
  className,
}: NavigationTabsProps) {
  return (
    <div
      className={cn("overflow-x-auto", className)}
      role="tablist"
    >
      <div className="flex gap-4">
        {tabs.map((tab) => {
          const isActive = tab.value === active;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.value)}
              className={cn(
                "shrink-0 border-b-2 pb-2 font-mono text-xs uppercase tracking-widest transition-colors",
                "focus-visible:ring-1 focus-visible:ring-[var(--cyan)]",
                isActive
                  ? "border-[var(--cyan)] text-[var(--fg)]"
                  : "border-transparent text-[var(--fg-2)] hover:text-[var(--fg)]",
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className="ml-1.5"
                  style={{ color: "var(--fg-3)" }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
