/**
 * Main-thread helper for the AudioWorklet-based capture pipeline.
 *
 * Handles worklet registration, AudioContext setup, and provides
 * a ScriptProcessorNode fallback for browsers without AudioWorklet support.
 */

const WORKLET_URL = "/audio-capture-processor.js";
const PROCESSOR_NAME = "audio-capture-processor";

/** Callback invoked with raw Float32 audio chunks from the mic. */
export type AudioChunkCallback = (samples: Float32Array) => void;

export interface CaptureNodes {
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  /** AudioWorkletNode when supported, null when using fallback. */
  workletNode: AudioWorkletNode | null;
  /** ScriptProcessorNode fallback, null when worklet is available. */
  scriptNode: ScriptProcessorNode | null;
  stream: MediaStream;
  stop: () => void;
}

/**
 * Set up the audio capture graph using AudioWorklet (preferred) with
 * ScriptProcessorNode fallback.
 *
 * Returns handles needed to stop capture later.
 */
export async function createCaptureNodes(
  stream: MediaStream,
  onChunk: AudioChunkCallback,
): Promise<CaptureNodes> {
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);

  let workletNode: AudioWorkletNode | null = null;
  let scriptNode: ScriptProcessorNode | null = null;

  const supportsWorklet = typeof AudioWorkletNode !== "undefined";

  if (supportsWorklet) {
    try {
      await context.audioWorklet.addModule(WORKLET_URL);
      workletNode = new AudioWorkletNode(context, PROCESSOR_NAME);
      workletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
        onChunk(e.data);
      };
      source.connect(workletNode);
      // Worklet doesn't need to connect to destination (no playback)
    } catch {
      // Worklet registration failed — fall through to ScriptProcessor
      workletNode = null;
    }
  }

  if (!workletNode) {
    // Fallback: ScriptProcessorNode (deprecated but widely supported)
    const bufferSize = 4096;
    scriptNode = context.createScriptProcessor(bufferSize, 1, 1);
    scriptNode.onaudioprocess = (e: AudioProcessingEvent) => {
      const input = e.inputBuffer.getChannelData(0);
      onChunk(new Float32Array(input));
    };
    source.connect(scriptNode);
    scriptNode.connect(context.destination);
  }

  const stop = () => {
    workletNode?.port.postMessage("stop");
    workletNode?.disconnect();
    scriptNode?.disconnect();
    source.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    void context.close();
  };

  return { context, source, workletNode, scriptNode, stream, stop };
}
