"use client";

import { useCallback, useEffect, useState } from "react";

export type PermissionStatus = "prompt" | "granted" | "denied" | "unsupported";

function getInitialStatus(): PermissionStatus {
  if (typeof navigator === "undefined") return "prompt";
  if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
  return "prompt";
}

export function useMicrophonePermission() {
  const [status, setStatus] = useState<PermissionStatus>(getInitialStatus);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) return;

    let cancelled = false;

    navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((result) => {
        if (cancelled) return;
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
