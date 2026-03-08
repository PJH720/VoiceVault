# ADR-001: Native Dependency Strategy

## Status: Accepted

**Date:** 2026-03-05
**Deciders:** VoiceVault maintainers
**Issue:** [#201](https://github.com/pj/VoiceVault/issues/201)

## Context

VoiceVault depends on three native C++ addon packages — `whisper-cpp-node`, `native-audio-node`, and `pyannote-cpp-node` — that originate from [Alt](https://altalt.io)'s closed-source application. These packages are **not published on npm** and cannot be installed by contributors or CI. Only the underlying C++ libraries (whisper.cpp, PortAudio, pyannote-ggml) are open source.

The current codebase uses dynamic `import()` with try/catch so the app runs without these addons (graceful fallbacks), but we need a concrete strategy for each dependency to move v0.6.0 forward without relying on phantom packages.

## Alternatives Evaluated

### 1. Transcription (replacing `whisper-cpp-node`)

| Option | Availability | Pros | Cons |
|--------|-------------|------|------|
| **`whisper-node`** (npm v1.1.1) | ✅ Public npm | Drop-in npm install; wraps whisper.cpp; runs on CPU; macOS/Linux/Windows | Last updated Nov 2023 — stale; spawns whisper.cpp binary internally; no CoreML acceleration; builds whisper.cpp from source on install (needs cmake) |
| **whisper.cpp sidecar binary** | ✅ Build from source / prebuilt releases | Full control over version & flags; CoreML/Metal support; no node-gyp issues; can bundle prebuilt per-platform | Must manage binary distribution; IPC overhead (child_process spawn); more packaging complexity in Electron |
| **`@nicktolhurst/whisper-addon`** | ❌ Not on npm (404) | N/A | Does not exist on public registry |

### 2. Audio Capture (replacing `native-audio-node`)

| Option | Availability | Pros | Cons |
|--------|-------------|------|------|
| **Electron Web Audio API** (MediaRecorder / getUserMedia) | ✅ Built into Chromium | Zero native deps; cross-platform; well-documented; already partially implemented as fallback | Renderer-process only; no system audio capture (mic only); requires IPC to send audio to main process |
| **`node-portaudio`** (npm v0.4.10) | ✅ Public npm | Node Stream interface; PortAudio is mature | Last updated 2019; likely broken on modern Node.js / Electron; native compilation required; unmaintained |

### 3. Speaker Diarization (replacing `pyannote-cpp-node`)

| Option | Availability | Pros | Cons |
|--------|-------------|------|------|
| **Heuristic fallback** (already coded in DiarizationService) | ✅ In codebase | Zero deps; works now; alternating 4s segments provide basic structure | Not real diarization; inaccurate speaker boundaries; acceptable only as MVP placeholder |
| **WebAssembly port of pyannote** | ❌ Does not exist | Would run in-browser | No one has built this; pyannote models are large (~80MB+); WASM perf unclear; months of effort |

## Decision

### Transcription: **whisper.cpp sidecar binary**

Bundle platform-specific prebuilt whisper.cpp binaries (`main` CLI) with the Electron app. Spawn as a child process, communicate via stdin/stdout or temp files.

**Rationale:** `whisper-node` is stale (2+ years without updates) and internally does the same thing (spawns a whisper.cpp binary). Going direct gives us control over the whisper.cpp version, enables CoreML/Metal acceleration on macOS, avoids node-gyp/cmake build issues for contributors, and simplifies Electron packaging. We can use whisper.cpp's official release binaries or build in CI.

**Implementation:**
- Download/build whisper.cpp per-platform in CI (macOS arm64, macOS x64, Linux x64, Windows x64)
- Bundle binary in Electron's `extraResources`
- `WhisperService` spawns binary via `child_process.execFile()`
- Parse output (whisper.cpp outputs timestamped segments to stdout in various formats)

### Audio Capture: **Electron Web Audio API (MediaRecorder)**

Use the browser-native MediaRecorder API in the renderer process for microphone capture.

**Rationale:** This is already the fallback path and works cross-platform with zero native dependencies. For v0.6.0, mic-only capture is sufficient. System audio capture (loopback) can be addressed in a future version if needed, potentially via platform-specific solutions.

**Implementation:**
- `navigator.mediaDevices.getUserMedia({ audio: true })` in renderer
- MediaRecorder with `audio/webm;codecs=opus` or WAV via AudioWorklet
- IPC bridge to send audio chunks/files to main process for transcription

### Diarization: **Heuristic fallback (keep current implementation)**

Retain the alternating 4s segment heuristic already implemented in `DiarizationService`.

**Rationale:** No viable drop-in replacement exists. A WebAssembly port of pyannote doesn't exist and would be a multi-month effort. The heuristic provides basic structure for the UI. Real diarization is a post-v0.6.0 enhancement — potentially via the sidecar pattern (pyannote-ggml binary) or a future npm package.

## Consequences

### Positive
- **Zero phantom dependencies** — all v0.6.0 features work with publicly available tools
- **Contributor-friendly** — `pnpm install` works without access to private registries
- **CI-friendly** — no secret npm tokens or private package access needed
- **CoreML/Metal acceleration** possible with sidecar whisper.cpp on macOS
- **Unblocks critical path** — transcription and audio capture are functional

### Negative
- **Sidecar binary packaging** adds complexity to the Electron build pipeline (~5-15MB per platform)
- **IPC overhead** for whisper.cpp communication (negligible for batch transcription)
- **No system audio capture** in v0.6.0 (mic only via Web Audio)
- **Diarization is fake** — heuristic alternating segments, not real speaker identification
- **Model files** for whisper.cpp must be bundled or downloaded on first run (~75MB for base model)

### Risks
- whisper.cpp binary compatibility across OS versions (mitigated by CI builds per platform)
- MediaRecorder codec support varies by Electron version (mitigated by using well-supported codecs)
- Users may expect real diarization — needs clear UI indication that it's approximate
