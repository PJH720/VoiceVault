/**
 * AudioWorklet processor for low-latency audio capture.
 *
 * Runs on the audio rendering thread. Collects Float32 samples from
 * the microphone and posts them to the main thread via MessagePort.
 *
 * NOTE: This file is served as a static asset (public/) because
 * AudioWorklet processors cannot be bundled — the browser loads them
 * via audioContext.audioWorklet.addModule(url).
 */

class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._stopped = false;
    this.port.onmessage = (event) => {
      if (event.data === "stop") {
        this._stopped = true;
      }
    };
  }

  /**
   * Called by the audio engine with 128 frames per invocation.
   * We copy channel 0 (mono) and post it to the main thread.
   */
  process(inputs) {
    if (this._stopped) return false;

    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;

    // Copy channel 0 — postMessage transfers ownership, so we need a copy
    const samples = new Float32Array(input[0]);
    this.port.postMessage(samples, [samples.buffer]);

    return true;
  }
}

registerProcessor("audio-capture-processor", AudioCaptureProcessor);
