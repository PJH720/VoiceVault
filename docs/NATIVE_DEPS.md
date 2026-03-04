# Native Dependencies — Optional Addon Setup

VoiceVault works out of the box with graceful fallbacks, but for full functionality (real audio capture, on-device transcription, speaker diarization), you need native C++ addons.

## Status

| Addon | Purpose | Status | Fallback |
|-------|---------|--------|----------|
| `native-audio-node` | CoreAudio mic/system capture | **Optional** — not on public npm | Renderer Web Audio API (mic only) |
| `whisper-cpp-node` | On-device Whisper STT (CoreML) | **Optional** — not on public npm | `[speech detected]` placeholder segments |
| `pyannote-cpp-node` | Speaker diarization | **Optional** — not on public npm | Alternating 4s speaker segments (heuristic) |

## How It Works

Each service uses dynamic `import()` with try/catch:
- If the native addon is installed → full functionality
- If missing → graceful fallback with clear logging

## Installing Native Addons (When Available)

These packages originate from [Alt](https://altalt.io)'s open-source engine libraries. They are not yet published to npm. When they become available:

```bash
# Audio capture (CoreAudio on macOS)
pnpm add native-audio-node

# Whisper STT (whisper.cpp with CoreML)
pnpm add whisper-cpp-node

# Speaker diarization (pyannote-ggml)
pnpm add pyannote-cpp-node
```

## Building from Source

If you want to build the native addons from their source repos:

### whisper.cpp (Transcription)
```bash
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp
cmake -B build -DWHISPER_COREML=ON  # macOS with CoreML
cmake --build build --config Release
```

### pyannote-ggml (Diarization)
```bash
git clone https://github.com/nicktolhurst/pyannote-ggml
cd pyannote-ggml
# Follow build instructions in the repo
```

## Alternatives Under Evaluation

| Phantom Dep | Potential Replacement | Notes |
|-------------|----------------------|-------|
| `native-audio-node` | `node-portaudio`, Electron Web Audio API | Web Audio works for mic; system audio needs platform APIs |
| `whisper-cpp-node` | `whisper-node` (npm), whisper.cpp sidecar binary | `whisper-node` exists on npm but may be less optimized |
| `pyannote-cpp-node` | Heuristic diarization, WebAssembly port | No drop-in replacement yet |

## Checking Runtime Status

The app exposes service availability via IPC. Check the Settings page for native addon status indicators.

```typescript
// In main process
audioService.isNativeAvailable()        // Promise<boolean>
audioService.getCaptureMode()           // 'native' | 'fallback'
whisperService.isNativeModuleAvailable() // boolean | null
diarizationService.isNativeModuleAvailable() // boolean | null
```
