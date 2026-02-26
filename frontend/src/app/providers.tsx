"use client";

import { Component, type ErrorInfo, type ReactNode, useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { getQueryClient } from "@/lib/query-client";

// ---------------------------------------------------------------------------
// Error Boundary
// ---------------------------------------------------------------------------

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
    // #region agent log
    fetch("http://127.0.0.1:7246/ingest/34638976-2389-45ac-9e64-67cf3b5f9b44", {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify({
        runId: "pre-fix-eb-1",
        hypothesisId: "H15_H16",
        location: "src/app/providers.tsx:ErrorBoundary:componentDidCatch",
        message: "error boundary captured runtime error",
        data: {
          errorName: error.name,
          errorMessage: error.message,
          stackPreview: typeof error.stack === "string" ? error.stack.slice(0, 600) : "",
          componentStack: info.componentStack?.slice(0, 1200) ?? "",
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center p-8">
          <h2 className="text-2xl font-bold text-red-600">
            Something went wrong
          </h2>
          <p className="mt-2 max-w-md text-center text-zinc-500">
            {this.state.error.message}
          </p>
          <button
            type="button"
            className="mt-6 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export default function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  // #region agent log
  fetch("http://127.0.0.1:7246/ingest/34638976-2389-45ac-9e64-67cf3b5f9b44", {
    method: "POST",
    mode: "no-cors",
    body: JSON.stringify({
      runId: "pre-fix-eb-1",
      hypothesisId: "H17",
      location: "src/app/providers.tsx:Providers:render",
      message: "providers rendered",
      data: {
        hasWindow: typeof window !== "undefined",
        pathname: typeof window !== "undefined" ? window.location.pathname : "server",
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  useEffect(() => {
    const send = (payload: Record<string, unknown>) => {
      // #region agent log
      fetch("http://127.0.0.1:7246/ingest/34638976-2389-45ac-9e64-67cf3b5f9b44", {
        method: "POST",
        mode: "no-cors",
        body: JSON.stringify({
          runId: "pre-fix-global-1",
          hypothesisId: "H19_H20",
          location: "src/app/providers.tsx:global-error-listeners",
          message: "captured global runtime error",
          data: {
            pathname: typeof window !== "undefined" ? window.location.pathname : "server",
            ...payload,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    };

    const onError = (event: ErrorEvent) => {
      send({
        type: "error",
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      send({
        type: "unhandledrejection",
        reason:
          typeof reason === "string"
            ? reason
            : reason && typeof reason.message === "string"
              ? reason.message
              : "unknown",
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {children}
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
