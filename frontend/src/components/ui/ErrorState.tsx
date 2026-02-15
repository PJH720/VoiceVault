import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";

interface ErrorStateProps {
  title?: string;
  error: unknown;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  error,
  onRetry,
  className,
}: ErrorStateProps) {
  const message =
    error instanceof ApiError
      ? error.message
      : "An unexpected error occurred.";

  return (
    <div
      role="alert"
      className={cn(
        "rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400",
        className,
      )}
    >
      <p className="font-medium">{title}</p>
      <p className="mt-1">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
