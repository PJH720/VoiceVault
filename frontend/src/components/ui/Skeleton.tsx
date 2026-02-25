import { cn } from "@/lib/cn";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse", className)}
      style={{ background: "var(--surface-3)" }}
    />
  );
}

/** Scan-line skeleton — terminal loading effect */
export function ScanSkeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("relative overflow-hidden", className)}
      style={{ background: "var(--surface-3)" }}
    >
      <div
        className="absolute inset-0 -translate-x-full"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(0,204,255,0.06), transparent)",
          animation: "scan 1.8s ease-in-out infinite",
        }}
      />
    </div>
  );
}

/** SummaryCard-shaped skeleton */
export function SummaryCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="border p-4"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      {/* Title row */}
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-8" />
      </div>
      {/* Body lines */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-3/4" />
      </div>
      {/* Keyword pills */}
      <div className="mt-3 flex gap-2">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-4 w-14" />
      </div>
    </div>
  );
}

/** Recording list item skeleton */
export function RecordingItemSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="border p-3"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-10" />
      </div>
      <div className="mt-2 flex gap-2">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-2.5 w-10" />
        <Skeleton className="h-2.5 w-14" />
      </div>
    </div>
  );
}
