# Phase C: Polish & Hardening — Plan

## Overview
Quality, i18n, testing, release prep. 6 issues, ~3 days.

## Execution Order (all independent)
```
C1 (#182) i18n hardcoded strings
C2 (#183) CloudModelName update
C3 (#184) AudioCapture fallback notification
C4 (#185) Test fixes
C5 (#186) electron-store schema
C6 (#187) Version bump + release
```

## Issue #182: Hardcoded English Strings
**Branch:** `fix/182-i18n-strings`

### Strategy
1. `grep -rn "'" src/renderer/ --include='*.ts' --include='*.tsx'` for quoted English strings
2. Replace each with `t('key')` — add keys to all 3 locale files
3. Focus areas: useRecording.ts, error messages, button labels, fallback text
4. Run `pnpm check:translations` to verify completeness

---

## Issue #183: CloudModelName Update
**Branch:** `fix/183-cloud-models`

### Strategy
1. Update `CloudModelName` type to include current models: `claude-sonnet-4-5`, `claude-opus-4-6`
2. Keep old models as deprecated options for backward compatibility
3. Update `CostEstimator` with current pricing from Anthropic docs
4. Update default model in `CloudLLMService`

### MCP/Tools
- **context7** MCP: Check latest Anthropic API model identifiers

---

## Issue #184: AudioCapture Fallback Notification
**Branch:** `fix/184-audio-fallback`

### Strategy
1. Add `AudioChannels.CAPTURE_MODE` IPC event
2. Emit `{ mode: 'native' | 'fallback' }` when recording starts
3. In fallback mode, also emit `AudioChannels.CAPTURE_WARNING` with reason
4. Renderer shows yellow banner: "Recording in fallback mode — transcription unavailable"
5. Clear chunkListeners when entering fallback

---

## Issue #185: Test Fixes
**Branch:** `fix/185-test-quality`

### Strategy
1. BilingualTranscript: wrap `fireEvent.click` in `await act(async () => { ... })`
2. AudioCaptureService: add `vi.useFakeTimers()` in beforeEach, `vi.advanceTimersByTime(3000)` instead of real sleep
3. Verify: `pnpm test` has 0 warnings and <2s total

---

## Issue #186: electron-store Schema
**Branch:** `feat/186-store-schema`

### Strategy
1. Define schema in `store.ts`:
   ```typescript
   const schema = {
     locale: { type: 'string', enum: ['ko', 'en', 'ja'], default: 'en' },
     whisperModel: { type: 'string', default: 'base' },
     llmModel: { type: 'string', default: 'gemma-2-3n-instruct-q4_k_m' },
     // ...
   }
   ```
2. Add `migrations` for future version upgrades
3. Wrap getters with validation — return default on invalid

---

## Issue #187: Version Bump + Release
**Branch:** `chore/187-release-prep`

### Strategy
1. Bump `package.json` version to `0.5.0`
2. Add `build` config section for electron-builder:
   ```json
   "build": {
     "appId": "com.voicevault.app",
     "productName": "VoiceVault",
     "mac": { "target": "dmg", "category": "public.app-category.productivity" },
     "linux": { "target": ["AppImage", "deb"] },
     "win": { "target": "nsis" },
     "files": ["out/**/*", "resources/**/*"]
   }
   ```
3. Verify `pnpm build:mac` succeeds
4. Add basic icon files in `build/` if missing
