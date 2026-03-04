# Claude Code Session Notes

## Active Issue: #172 — Replace phantom native dependencies

### Problem
`native-audio-node`, `whisper-cpp-node`, `pyannote-cpp-node` are phantom npm packages from Alt's closed-source Electron app. They do NOT exist on public npm. The app builds because they're never imported at build time, but any runtime usage crashes with MODULE_NOT_FOUND.

### Acceptance Criteria
- [ ] Verify which native deps actually resolve at runtime
- [ ] For unavailable packages: implement graceful fallback stubs that log warnings
- [ ] For `native-audio-node`: evaluate `node-portaudio`, `node-record-lpcm16`, or Web Audio API via Electron
- [ ] For `whisper-cpp-node`: evaluate `whisper-node` or bundling whisper.cpp as a sidecar binary
- [ ] For `pyannote-cpp-node`: implement heuristic diarization fallback (already partially exists)
- [ ] App launches and records audio without crash even when native addons are missing
- [ ] All existing tests still pass

### Files to modify
- `package.json`
- `src/main/services/AudioCaptureService.ts`
- `src/main/services/WhisperService.ts`
- `src/main/services/DiarizationService.ts`

### Constraints
- Electron main process (Node.js context, NOT browser)
- Must preserve existing service interfaces (IPC handlers depend on them)
- Graceful degradation: if a native addon isn't available, log a warning and provide a stub
- All 46 existing tests must pass
- `pnpm build` must succeed
- Conventional commits

### Architecture Context
- Services are instantiated in `src/main/index.ts` after `app.whenReady()`
- IPC handlers in `src/main/ipc/` call service methods
- Types in `src/shared/types.ts`
- Current branch: `fix/182-i18n-strings` (will create new branch)

## Mistakes Log
- [2026-03-05] electron-store v11 is ESM-only — use dynamic import() for CJS compat
- [2026-03-05] Claude Code with all plugins takes 5+ min to init — use --mcp-config '{}' to skip
- [2026-03-05] `claude -p ... 2>&1 | tail` loses output due to buffering — don't pipe
