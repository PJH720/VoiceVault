# WebView Compatibility Audit — WebAudio APIs

Electrobun uses system webviews: WKWebView (macOS/iOS) and WebKitGTK (Linux).
This audit covers WebAudio API usage in `src/renderer/src/` and compatibility status.

## Affected File

Only one file uses WebAudio APIs: **`src/renderer/src/hooks/useRecording.ts`**

## API Usage vs WebView Compatibility

| API | Line(s) | WKWebView (macOS) | WebKitGTK (Linux) | Verdict |
|-----|---------|-------------------|-------------------|---------|
| `navigator.mediaDevices.getUserMedia` | 107 | 11.0+ | 2.18+ | **PASS** |
| `new AudioContext()` | 118 | 14.5+ | 2.22+ | **PASS** |
| `createMediaStreamSource()` | 123 | 14.5+ | 2.22+ | **PASS** |
| `createAnalyser()` | 127 | 14.5+ | 2.22+ | **PASS** |
| `getFloatTimeDomainData()` | 154 | 14.5+ | 2.22+ | **PASS** |
| `createScriptProcessor()` | 135 | All versions | All versions | **WARN** |
| `MediaStream` | 50, 98 | 11.0+ | 2.18+ | **PASS** |

## Details

### `createScriptProcessor` — WARN

**Status:** Deprecated in Web Audio spec, replaced by `AudioWorklet`.

**Impact:** Still works on all current WebKit versions. Not removed yet. However:
- WKWebView and WebKitGTK do NOT plan imminent removal
- `AudioWorklet` is fully supported on WKWebView 15.4+ and WebKitGTK 2.36+
- Migration to `AudioWorkletNode` is recommended for future-proofing

**Action:** No blocker for Phase 2. Should migrate to `AudioWorklet` in Phase 3/4.

### `AudioContext({ sampleRate })` constructor option

Line 118-119 creates an `AudioContext` with the stream's native sample rate (often 48000).
This is correct behavior — WebKit defaults to 48000 Hz natively, so no mismatch expected.

### `webkitAudioContext` prefix

**Not used.** The codebase correctly uses the unprefixed `AudioContext`, which is supported
on all modern WebKit versions. No action needed.

### `AudioWorklet`

**Not currently used** (uses deprecated `ScriptProcessorNode` instead).
When migrating, `AudioWorklet` requires:
- WKWebView 15.4+ (macOS 12.3+, March 2022)
- WebKitGTK 2.36+ (March 2022)

Both are well past the minimum Electrobun targets.

## Overall Verdict

**PASS** — All WebAudio APIs used in the renderer are compatible with current WKWebView
and WebKitGTK. The `createScriptProcessor` usage is deprecated but functional; migration
to `AudioWorklet` can happen in a later phase.
