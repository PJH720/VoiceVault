"use client";

import { useCallback, useEffect, useState } from "react";

export type PermissionStatus = "prompt" | "granted" | "denied" | "unsupported";

function getInitialStatus(): PermissionStatus {
  // #region agent log
  fetch("http://127.0.0.1:7246/ingest/34638976-2389-45ac-9e64-67cf3b5f9b44", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      runId: "pre-fix-perm-1",
      hypothesisId: "H11_H12",
      location: "src/hooks/use-microphone-permission.ts:getInitialStatus",
      message: "computing initial permission status",
      data: {
        hasNavigator: typeof navigator !== "undefined",
        hasMediaDevices:
          typeof navigator !== "undefined" && Boolean(navigator.mediaDevices),
        hasGetUserMedia:
          typeof navigator !== "undefined" &&
          Boolean(navigator.mediaDevices?.getUserMedia),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  // Keep initial render deterministic across server/client to avoid hydration mismatch.
  // Browser capability checks are applied in useEffect after hydration.
  return "prompt";
}

export function useMicrophonePermission() {
  const [status, setStatus] = useState<PermissionStatus>(getInitialStatus);

  useEffect(() => {
    // #region agent log
    fetch("http://127.0.0.1:7246/ingest/34638976-2389-45ac-9e64-67cf3b5f9b44", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runId: "pre-fix-perm-1",
        hypothesisId: "H13",
        location: "src/hooks/use-microphone-permission.ts:useEffect:entry",
        message: "permission effect entered",
        data: {
          statusAtEntry: status,
          hasGetUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
          hasPermissionsApi: Boolean(navigator.permissions?.query),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      return;
    }

    let cancelled = false;

    navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((result) => {
        if (cancelled) return;
        // #region agent log
        fetch("http://127.0.0.1:7246/ingest/34638976-2389-45ac-9e64-67cf3b5f9b44", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId: "pre-fix-perm-1",
            hypothesisId: "H13",
            location: "src/hooks/use-microphone-permission.ts:permissions-query:resolved",
            message: "permissions.query resolved",
            data: {
              queryState: result.state,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        setStatus(result.state as PermissionStatus);

        const handleChange = () => {
          setStatus(result.state as PermissionStatus);
        };
        result.addEventListener("change", handleChange);
      })
      .catch(() => {
        // permissions.query not supported (e.g. Firefox) — remain "prompt"
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const request = useCallback(async (): Promise<PermissionStatus> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      return "unsupported";
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Immediately release the stream — we only needed it for the permission grant
      stream.getTracks().forEach((track) => track.stop());
      setStatus("granted");
      return "granted";
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setStatus("denied");
        return "denied";
      }
      setStatus("denied");
      return "denied";
    }
  }, []);

  return { status, request };
}
