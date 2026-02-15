/**
 * Resample raw Float32 audio to 16 kHz mono and encode as PCM16 (Int16Array).
 *
 * The backend expects: PCM 16-bit signed, 16 000 Hz, mono — this module
 * bridges the gap between the browser's native sample rate (typically 44.1/48 kHz)
 * and that server format.
 */

/** Target sample rate expected by the VoiceVault backend. */
export const TARGET_SAMPLE_RATE = 16_000;

/**
 * Downsample a Float32Array captured at `inputRate` to `TARGET_SAMPLE_RATE`
 * using linear interpolation.
 *
 * Returns a new Float32Array at the target rate.
 */
export function resampleToTarget(
  input: Float32Array,
  inputRate: number,
): Float32Array {
  if (inputRate === TARGET_SAMPLE_RATE) return input;

  const ratio = inputRate / TARGET_SAMPLE_RATE;
  const outputLength = Math.ceil(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const lo = Math.floor(srcIndex);
    const hi = Math.min(lo + 1, input.length - 1);
    const frac = srcIndex - lo;
    output[i] = (input[lo] ?? 0) * (1 - frac) + (input[hi] ?? 0) * frac;
  }

  return output;
}

/**
 * Encode a Float32Array (values in -1..1) to PCM16 (Int16Array).
 *
 * Clamps values to prevent overflow distortion.
 */
export function float32ToPcm16(float32: Float32Array): Int16Array {
  const pcm16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i] ?? 0));
    pcm16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return pcm16;
}

/**
 * Full pipeline: resample + encode in one call.
 *
 * Takes raw Float32 audio at the browser's native rate and returns
 * an ArrayBuffer of PCM16 at 16 kHz, ready to send over WebSocket.
 */
export function encodePcm16Chunk(
  float32: Float32Array,
  inputSampleRate: number,
): ArrayBuffer {
  const resampled = resampleToTarget(float32, inputSampleRate);
  const pcm16 = float32ToPcm16(resampled);
  return pcm16.buffer as ArrayBuffer;
}
