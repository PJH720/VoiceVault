"use client";

import { useCallback, useEffect, useInsertionEffect, useRef, useState } from "react";
import { useRecordingStore } from "@/stores/recording";
import {
  createCaptureNodes,
  type CaptureNodes,
} from "@/lib/audio/audio-worklet-processor";
import { encodePcm16Chunk, TARGET_SAMPLE_RATE } from "@/lib/audio/pcm-encoder";

/** Default interval (ms) between flushing buffered audio as PCM16 chunks. */
const DEFAULT_FLUSH_INTERVAL_MS = 250;

export interface UseAudioCaptureOptions {
  /** Called with a PCM16 ArrayBuffer chunk at 16 kHz mono, ready for WebSocket. */
  onChunk: (pcm16: ArrayBuffer) => void;
  /** Flush interval in milliseconds. Default: 250. */
  flushIntervalMs?: number;
}

export type CaptureStatus = "idle" | "starting" | "capturing" | "error";

export interface UseAudioCaptureReturn {
  status: CaptureStatus;
  /** Actual sample rate of the AudioContext (e.g. 48000). */
  sampleRate: number | null;
  startCapture: () => Promise<void>;
  stopCapture: () => void;
}

/**
 * Hook that captures audio from the selected microphone, resamples to 16 kHz
 * mono, encodes as PCM16, and delivers chunks via `onChunk` callback.
 *
 * Reads `selectedDeviceId` from the Zustand recording store (set by C1).
 *
 * Usage:
 * ```tsx
 * const { status, startCapture, stopCapture } = useAudioCapture({
 *   onChunk: (pcm16) => websocket.send(pcm16),
 * });
 * ```
 */
export function useAudioCapture(
  options: UseAudioCaptureOptions,
): UseAudioCaptureReturn {
  const { onChunk, flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS } = options;

  const selectedDeviceId = useRecordingStore((s) => s.selectedDeviceId);

  const [status, setStatus] = useState<CaptureStatus>("idle");
  const [sampleRate, setSampleRate] = useState<number | null>(null);

  // Mutable refs — audio callbacks fire at high frequency, no re-renders
  const nodesRef = useRef<CaptureNodes | null>(null);
  const bufferRef = useRef<Float32Array[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onChunkRef = useRef(onChunk);
  useInsertionEffect(() => {
    onChunkRef.current = onChunk;
  });

  /** Flush accumulated Float32 samples → resample → PCM16 → callback. */
  const flush = useCallback(() => {
    const chunks = bufferRef.current;
    if (chunks.length === 0) return;
    bufferRef.current = [];

    const context = nodesRef.current?.context;
    if (!context) return;

    // Merge all buffered Float32 chunks into one contiguous array
    let totalLength = 0;
    for (const c of chunks) totalLength += c.length;
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }

    const pcm16 = encodePcm16Chunk(merged, context.sampleRate);
    onChunkRef.current(pcm16);
  }, []);

  const startCapture = useCallback(async () => {
    if (nodesRef.current) return; // already capturing

    setStatus("starting");
    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId } }
          : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      const nodes = await createCaptureNodes(stream, (samples) => {
        bufferRef.current.push(samples);
      });

      nodesRef.current = nodes;
      setSampleRate(nodes.context.sampleRate);

      // Start periodic flush
      flushTimerRef.current = setInterval(flush, flushIntervalMs);

      setStatus("capturing");
    } catch {
      setStatus("error");
    }
  }, [selectedDeviceId, flush, flushIntervalMs]);

  const stopCapture = useCallback(() => {
    // Flush remaining buffered samples
    flush();

    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    nodesRef.current?.stop();
    nodesRef.current = null;
    bufferRef.current = [];

    setSampleRate(null);
    setStatus("idle");
  }, [flush]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      nodesRef.current?.stop();
    };
  }, []);

  return { status, sampleRate, startCapture, stopCapture };
}
