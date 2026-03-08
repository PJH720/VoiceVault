# Native Dependencies — Strategy & Setup

> **ADR:** See [ADR-001-native-deps.md](milestones/v0.6.0/ADR-001-native-deps.md) for the full decision record.

VoiceVault works out of the box with graceful fallbacks. For v0.6.0, we've replaced all phantom native addon dependencies with publicly available alternatives.

## v0.6.0 Strategy

| Original Phantom Dep | Replacement | Status |
|----------------------|-------------|--------|
| `whisper-cpp-node` | **whisper.cpp sidecar binary** — bundled prebuilt binary, spawned as child process | ✅ Chosen ([ADR-001](milestones/v0.6.0/ADR-001-native-deps.md)) |
| `native-audio-node` | **Electron Web Audio API** — MediaRecorder in renderer process (mic capture) | ✅ Chosen ([ADR-001](milestones/v0.6.0/ADR-001-native-deps.md)) |
| `pyannote-cpp-node` | **Heuristic fallback** — alternating 4s speaker segments (already coded) | ✅ Chosen ([ADR-001](milestones/v0.6.0/ADR-001-native-deps.md)) |

## How It Works

Each service uses dynamic `import()` with try/catch:
- If the native addon is installed → full functionality
- If missing → graceful fallback with clear logging

### Transcription (whisper.cpp sidecar)

The `WhisperService` spawns a bundled whisper.cpp binary via `child_process.execFile()`. The binary is packaged in Electron's `extraResources` per platform (macOS arm64/x64, Linux x64, Windows x64). CoreML/Metal acceleration is available on macOS.

```bash
# Building whisper.cpp from source (for development)
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp
cmake -B build -DWHISPER_COREML=ON  # macOS with CoreML
cmake --build build --config Release
```

### Audio Capture (Web Audio API)

Microphone capture uses the browser-native MediaRecorder API in the renderer process:
- `navigator.mediaDevices.getUserMedia({ audio: true })`
- Audio chunks sent to main process via IPC
- No native dependencies required

### Diarization (Heuristic)

The `DiarizationService` uses an alternating 4s segment heuristic as a placeholder. This is not real speaker diarization — it provides basic structure for the UI. Real diarization (via pyannote-ggml sidecar or other solution) is planned for a future release.

## Alternatives Considered (Not Chosen)

| Option | Why Not |
|--------|---------|
| `whisper-node` (npm) | Stale (last updated Nov 2023); internally spawns whisper.cpp anyway; no CoreML support |
| `@nicktolhurst/whisper-addon` | Not published on npm (404) |
| `node-portaudio` (npm) | Unmaintained since 2019; likely broken on modern Node.js/Electron |
| WebAssembly pyannote port | Does not exist; would be months of effort |

## Checking Runtime Status

The app exposes service availability via IPC. Check the Settings page for native addon status indicators.

```typescript
// In main process
audioService.isNativeAvailable()        // Promise<boolean>
audioService.getCaptureMode()           // 'native' | 'fallback'
whisperService.isNativeModuleAvailable() // boolean | null
diarizationService.isNativeModuleAvailable() // boolean | null
```
