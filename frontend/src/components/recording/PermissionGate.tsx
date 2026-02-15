"use client";

import type { ReactNode } from "react";
import type { PermissionStatus } from "@/hooks/use-microphone-permission";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

interface PermissionGateProps {
  status: PermissionStatus;
  onRequest: () => void;
  children: ReactNode;
}

export function PermissionGate({ status, onRequest, children }: PermissionGateProps) {
  if (status === "granted") {
    return <>{children}</>;
  }

  if (status === "unsupported") {
    return (
      <Card className="mx-auto max-w-md text-center">
        <CardHeader>
          <CardTitle>Browser Not Supported</CardTitle>
        </CardHeader>
        <CardContent>
          <p>
            Your browser does not support audio recording.
            Please use a modern browser such as Chrome, Firefox, or Edge.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (status === "denied") {
    return (
      <Card className="mx-auto max-w-md text-center">
        <CardHeader>
          <CardTitle>Microphone Access Denied</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            VoiceVault needs microphone access to record audio. Permission was denied by your browser.
          </p>
          <p className="text-xs text-zinc-400">
            To fix this, click the lock/site-settings icon in your browser&apos;s address bar
            and allow microphone access, then reload the page.
          </p>
          <Button variant="secondary" onClick={onRequest}>
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  // status === "prompt" — initial state
  return (
    <Card className="mx-auto max-w-md text-center">
      <CardHeader>
        <CardTitle>Microphone Permission Required</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p>
          VoiceVault needs access to your microphone to record audio.
          Click the button below to grant permission.
        </p>
        <Button onClick={onRequest}>
          Allow Microphone Access
        </Button>
      </CardContent>
    </Card>
  );
}
