"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const NAV_ITEMS = [
  { href: "/recording", label: "Recording", icon: "🎙" },
  { href: "/summaries", label: "Summaries", icon: "📝" },
  { href: "/rag", label: "Search", icon: "🔍" },
  { href: "/export", label: "Export", icon: "📤" },
] as const;

export default function Navigation() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop top nav — hidden on mobile */}
      <nav className="hidden gap-1 sm:flex">
        {NAV_ITEMS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              pathname === href
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-100",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      {/* Mobile bottom tab bar — hidden on desktop */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200 bg-white/80 backdrop-blur-md sm:hidden dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="flex h-14 items-center justify-around">
          {NAV_ITEMS.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-0.5 text-xs font-medium transition-colors",
                pathname === href
                  ? "text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-500 dark:text-zinc-400",
              )}
            >
              <span className="text-lg">{icon}</span>
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
