# Phase A: Foundation Fixes — Plan

## Overview
Pre-launch blockers that must be resolved before the app can run. 5 issues, ~3 days.

## Execution Order (dependency-aware)
```
A1 (#172) Phantom deps → A4 (#175) Graceful shutdown → B2 (#178) Service registry
A2 (#173) Error boundaries (independent)
A3 (#174) Migration safety (independent)
A5 (#176) Memoization fix (independent)
```

## Issue #172: Phantom Native Dependencies
**Branch:** `fix/172-phantom-native-deps`

### Strategy
1. **Audit:** Try `require('native-audio-node')` etc. in a test script — confirm they fail
2. **native-audio-node replacement:**
   - Use Electron's `desktopCapturer` + Web Audio API for mic capture
   - Or bundle `sox`/`rec` as sidecar and spawn process
   - Wrap in same `MicrophoneRecorder` interface so AudioCaptureService needs minimal changes
3. **whisper-cpp-node replacement:**
   - Use `@nicholasgasior/whisper-cpp` (actual npm package) or
   - Bundle `whisper.cpp` main binary and use child_process + stdin/stdout
   - Dynamic import with try/catch already exists — just need the right module name
4. **pyannote-cpp-node:** Already has heuristic fallback in DiarizationService — just make the import graceful

### Key Files
- `src/main/services/AudioCaptureService.ts` — replace `MicrophoneRecorder` import
- `src/main/services/WhisperService.ts` — replace `whisper-cpp-node` dynamic import
- `src/main/services/DiarizationService.ts` — ensure graceful fallback

### MCP/Tools
- **context7** MCP: Look up `@nicholasgasior/whisper-cpp` and `node-portaudio` APIs
- **serena** MCP: Track changes across service files

### Verification
- `pnpm build` passes
- `pnpm dev` launches without crash
- All 46 tests pass

---

## Issue #173: React ErrorBoundary
**Branch:** `fix/173-error-boundary`

### Strategy
1. Create class component `ErrorBoundary` with `getDerivedStateFromError` + `componentDidCatch`
2. Fallback UI: error icon, message, retry button, "Report" link
3. i18n keys: `error.boundary.title`, `error.boundary.message`, `error.boundary.retry`
4. Wrap each page in App.tsx: `<ErrorBoundary key={page}><LibraryView/></ErrorBoundary>`
5. Log to main via `window.api` IPC call

### Verification
- Unit test: render child that throws → see fallback
- Manual: intentionally break a component → app survives

---

## Issue #174: Migration Transaction Safety
**Branch:** `fix/174-migration-split`

### Strategy
1. Split `007_templates.sql` → `007_template_id.sql` (ADD template_id) + `008_classification_confidence.sql` (ADD classification_confidence + CREATE INDEX)
2. Rename current `008_translations.sql` → `009_translations.sql`
3. Add comment in `runMigrations()`: "Note: ALTER TABLE implicitly commits in SQLite"
4. Test with fresh DB + test with existing DB at version 6

### Verification
- Fresh DB: all migrations apply cleanly
- DB at version 7 (current): no double-apply errors from ensureLegacyColumns

---

## Issue #175: Graceful Shutdown
**Branch:** `fix/175-graceful-shutdown`

### Strategy
1. In `index.ts`, track service references (whisperService, llmService, embeddingService, audioService)
2. In `before-quit`:
   ```typescript
   app.on('before-quit', async () => {
     const timeout = setTimeout(() => process.exit(1), 5000)
     audioService?.stopRecording?.().catch(() => {})
     whisperService?.destroy()
     llmService?.unload()
     embeddingService?.destroy()
     databaseService?.close()
     clearTimeout(timeout)
   })
   ```
3. This becomes the foundation for B2's ServiceRegistry

### Verification
- App quits cleanly without hanging
- No orphan processes after quit

---

## Issue #176: RecordingProvider Memoization
**Branch:** `fix/176-context-memo`

### Strategy
1. Split useRecording return into stable refs:
   ```typescript
   const state = useMemo(() => ({
     isRecording, levels, durationMs, permissionGranted, lastResult, errorMessage
   }), [isRecording, levels, durationMs, permissionGranted, lastResult, errorMessage])
   const actions = useRef({ requestPermission, startRecording, stopRecording })
   ```
2. Provide `{ ...state, ...actions.current }` — actions are stable refs
3. Apply same pattern to LibraryContext

### Verification
- React DevTools Profiler: child components don't re-render when unrelated state changes
- Recording still works end-to-end
