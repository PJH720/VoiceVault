# Changelog

## [0.7.0] — 2026-03-08

### BREAKING — Runtime replaced: Electron → Electrobun

VoiceVault no longer ships or requires Electron. The application now runs on
**Electrobun** (Bun 1.3 + Zig + system WebView). If you are running from source,
`pnpm dev` is the only command you need. There is no migration step for end users —
the SQLite database schema is unchanged and all recordings, transcripts, and settings
carry over automatically.

### Performance

- **Whisper subprocess latency −15%** — `whisper-cpp-node` (N-API + dlopen) replaced
  by `Bun.spawn("whisper-cli")`. Eliminates JNI initialization overhead; model cold-start
  drops from ~280ms to ~240ms on `ggml-tiny.en`.
- **LLM subprocess — no 3 GB install** — `node-llama-cpp` required a GPU driver
  dependency tree and a 10-minute first-run model download. `llama-cli` (Homebrew/
  Linuxbrew binary) is a single static executable. Token streaming begins immediately.
- **SQLite — zero compilation** — `better-sqlite3` (node-gyp, ABI-locked to Electron
  version) replaced by `bun:sqlite` (stdlib, synchronous, no build step). Cold open
  on the recordings database: ~4ms.
- **Renderer bridge latency** — `contextBridge` structured-clone IPC replaced by
  localhost HTTP POST (`fetch` to `http://localhost:50100/rpc`). Round-trip for a
  cached DB read: ~0.3ms. For LLM streaming, WebSocket push replaces polling.
- **`node_modules` size −~40%** — 13 packages removed including Electron (200 MB+
  Chromium runtime), `node-llama-cpp`, and all `@electron-toolkit/*` packages.

### Architecture

- **Electrobun launcher model** — GTK/WebKitGTK event loop runs on the launcher's
  native thread. The Bun Worker's event loop is permanently unblocked and handles
  all HTTP RPC traffic without thread contention.
- **HTTP RPC server** — `Bun.serve()` on port 50100 replaces `contextBridge`.
  Endpoint: `POST /rpc { channel, params }`. Push events: WebSocket `/events`.
  Health check: `GET /health`. Fully testable with `curl` — no Electron DevTools
  required to inspect IPC traffic.
- **`bun:sqlite` as single storage primitive** — Replaces both `better-sqlite3`
  (recording/transcript data) and `electron-store` (settings/preferences). Single
  database at `~/.voicevault/voicevault.db` with 8 migrations. API is synchronous
  and spec-compliant.
- **Zero renderer churn** — All 99 `window.api.*` call sites in the React renderer
  are satisfied by `src/renderer/src/lib/electrobun-bridge.ts`, a 300-line shim
  that translates Electron-style `ipcRenderer.invoke()` calls to HTTP fetches.
  No component was modified.

### Structural Cleanup

- `src/electrobun/` renamed to `src/main/` (framework-agnostic)
- `archived/` (76 dead Electron files) deleted from working tree; preserved in Git
- `libasar.so`, `libNativeWrapper.so`, `libNativeWrapper_cef.so`, `libwebgpu_dawn.so`
  untracked — Electrobun generates these at install time; they must not be committed
- `out/main/`, `out/preload/` (Electron build artifacts) removed
- `electron-builder.yml`, `entitlements.plist` removed
- App icons consolidated: `build/icon.*` → `resources/`
- `.gitignore` updated: `*.so`, `build/`, `out/`, coverage artifacts, Python caches

### Removed Dependencies (−13)

`electron@^39`, `electron-builder`, `electron-vite`, `better-sqlite3`,
`electron-store`, `node-llama-cpp`, `whisper-cpp-node`,
`@electron-toolkit/preload`, `@electron-toolkit/utils`,
`@electron-toolkit/tsconfig`, `@electron-toolkit/eslint-config-ts`,
`@electron-toolkit/eslint-config-prettier`, `@types/better-sqlite3`

### Added Dependencies (+3)

`electrobun@^1.15.1`, `typescript-eslint@^8`, `eslint-config-prettier@^10`

### Developer Experience

- `pnpm dev` — starts Vite renderer (port 5173) + Electrobun launcher concurrently
- `pnpm build` — `vite build` renderer + `bun build` main process; completes in ~2.5s
- `pnpm test:whisper` — new smoke test script; validates binary, model, and transcription
  via live RPC in < 5s
- `pnpm package:linux / :mac / :win` — replaces `electron-builder` packaging commands
- No `postinstall` hook — `electron-builder install-app-deps` is gone; `pnpm install`
  is now a one-step, no-compile operation

### Migration Notes (developers)

| Old | New |
|-----|-----|
| `electron-vite dev` | `pnpm dev` |
| `electron-vite build` | `pnpm build` |
| `electron-builder --linux` | `pnpm package:linux` |
| `ipcRenderer.invoke(channel, ...args)` | `fetch POST /rpc { channel, params }` |
| `app.getPath('userData')` → `~/.config/VoiceVault` | `VOICEVAULT_USER_DATA_PATH` or `~/.voicevault` |
| `electron-store` get/set | `bun:sqlite` key-value via `services/settings.ts` |
| `new Database()` (better-sqlite3) | `getDb()` from `services/db.ts` (bun:sqlite) |

---

## [0.6.0] — 2026-03-05

### Features
- **Web Audio API recording** — browser-based audio capture with no native dependencies required (#187)
- **Whisper.cpp sidecar transcription** — on-device speech-to-text via whisper.cpp child process (#188)
- **node-llama-cpp model download + Settings UI** — download, select, and manage GGUF models from the app (#189)
- **Summarization pipeline** — 60-second auto-summary with structured JSON output (action items, decisions, key statements) (#190)
- **Classification flow** — auto-classify recordings into 8 built-in templates with zero-shot LLM classification (#191)
- **Obsidian export** — YAML frontmatter, `[[wikilinks]]`, and batch export to Obsidian vaults (#192)
- **Search view** — RAG search UI with graceful degradation when vector DB is unavailable (#193)
- **Settings UX improvements** — test connection button, API key validation, vault path picker (#200)

### Security
- **IPC validation hardened to 100%** — all IPC handlers validate inputs with strict schemas (#194)
- **Content Security Policy (CSP)** — restrictive CSP headers blocking eval, inline scripts, and remote loads (#195)
- **safeStorage for credentials** — API keys encrypted via Electron safeStorage API (#196)

### UX
- **Empty states** — friendly illustrations and guidance for all empty views (#197)
- **i18n completeness** — all user-facing strings translated in en/ko/ja (#198)
- **First-launch guidance** — onboarding flow for new users (#199)

### Testing & Performance
- **102 tests (40 new)** — comprehensive unit test coverage across services and components (#201)
- **Performance benchmarks documented** — startup time, memory usage, and inference latency baselines (#202)

### Documentation
- **Milestone context pack** — full v0.6.0 planning and tracking documentation (#203)
- **ADR-001** — Architecture Decision Record for Electron + whisper.cpp sidecar approach (#204)
- **wiki/Architecture** — detailed architecture documentation (#205)
- **wiki/Roadmap** — updated project roadmap with phase tracking (#206)

## [0.5.0] — 2026-03-05

### Features
- **OpenAI & Gemini LLM providers** — GPT-4o, GPT-4o-mini, Gemini 2.5 Flash/Pro alongside existing Ollama & Claude (#171)
- **Client-side routing** — HashRouter with react-router-dom, persistent recording across navigation (#179)
- **Content Security Policy** — CSP headers via session.webRequest to block eval/inline/remote scripts (#181)
- **Singleton ServiceRegistry** — lazy-creating service cache preventing duplicate model loads (~3 GB savings) (#178)
- **VectorService performance** — adaptive chunked search, early-exit cosine similarity, prepared statements (#177)
- **electron-store schema validation** — versioned schema with migration support (#186)
- **Graceful shutdown** — registered service destroy callbacks with 5s timeout (#175)
- **i18n expansion** — model names, playback speeds, error messages in en/ko/ja (#182)

### Bug Fixes
- Remove phantom native dependencies (sharp, fluent-ffmpeg, node-vad) with graceful fallbacks (#172)
- Add ErrorBoundary component wrapping each page (#173)
- Fix ALTER TABLE migration running outside transaction wrappers (#174)
- Fix RecordingContext useMemo missing dependencies (#176)
- Fix FTS5 MATCH injection via double-quote escaping (#180)
- Update CloudModelName type to current Anthropic model identifiers (#183)
- Fix AudioCapture fallback — clear chunkListeners, expose capture mode to renderer (#184)
- Resolve act() warnings and slow timer in tests (#185)

### Infrastructure
- CI workflow rewritten for flat Electron project structure
