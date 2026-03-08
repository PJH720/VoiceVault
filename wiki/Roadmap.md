# Roadmap

---

## ✅ Shipped

### v0.5.0 — Foundation
- Real-time transcription (Whisper)
- 1-minute auto-summarization
- Zero-shot classification with templates
- RAG search across recordings
- Obsidian Markdown export
- Hourly hierarchical summaries
- Cross-boundary time range extraction

### v0.6.0 — Make It Real
- Brutalist design system + 7 new UI components
- RAG Search and Export pages (full redesign)
- Accessibility pass (ARIA labels, responsive grids, `useId()`)
- Component catalog (`docs/spec/components.md`)
- Design token system

### v0.7.0 — Electrobun Migration ✨
- **Entire Python/Next.js/Docker web stack retired**
- Migrated from Electron 39 to Electrobun 1.15 (Bun + Zig + system WebView)
- Replaced N-API native bindings with `Bun.spawn` subprocesses:
  - `whisper-cpp-node` → `Bun.spawn whisper-cli`
  - `node-llama-cpp` → `Bun.spawn llama-cli`
  - `better-sqlite3` → `bun:sqlite`
  - `electron-store` → `bun:sqlite`-backed settings
- Renderer bridge shim — 99 `window.api.*` channels, zero renderer churn
- HTTP RPC server (port 50100) replaces Electron IPC
- Deep refactor: `src/main/utils/subprocess.ts`, `validate.ts`, all RPC handlers simplified
- All legacy Python tests, Docker files, Makefiles, and build artifacts deleted
- 9/9 TypeScript unit tests green

---

## 🚧 Active — v0.8.0 — Packaging & Obsidian Integration

**Target:** April 2026 | [Milestone](https://github.com/PJH720/VoiceVault/milestone/9)

### New issues (v0.8.0)

| # | Title | Priority |
|---|---|---|
| [#221](https://github.com/PJH720/VoiceVault/issues/221) | Production .app / .AppImage builds via `electrobun package` | 🔴 P0 |
| [#222](https://github.com/PJH720/VoiceVault/issues/222) | Obsidian plugin ↔ Electrobun IPC bridge via local HTTP API | 🔴 P0 |
| [#223](https://github.com/PJH720/VoiceVault/issues/223) | Hardware-aware Whisper model selection (CPU/GPU auto-detect) | 🟡 P1 |
| [#224](https://github.com/PJH720/VoiceVault/issues/224) | In-app auto-updater — check GitHub Releases and apply updates | 🟡 P1 |

### Carried from v0.6.0

| # | Title |
|---|---|
| [#203](https://github.com/PJH720/VoiceVault/issues/203) | Web Audio API recording as primary mic capture |
| [#206](https://github.com/PJH720/VoiceVault/issues/206) | End-to-end recording flow — record → stop → save → library |
| [#207](https://github.com/PJH720/VoiceVault/issues/207) | Summarization pipeline — transcript → LLM → structured output → UI |
| [#208](https://github.com/PJH720/VoiceVault/issues/208) | Obsidian export with real recording data |
| [#209](https://github.com/PJH720/VoiceVault/issues/209) | Classification flow — auto-classify on stop + template badge |
| [#210](https://github.com/PJH720/VoiceVault/issues/210) | Search view — graceful degradation + RAG smoke test |
| [#211](https://github.com/PJH720/VoiceVault/issues/211) | Unit + E2E test coverage for recording and transcription pipelines |
| [#213](https://github.com/PJH720/VoiceVault/issues/213) | Settings UX — model management, API keys, language picker |
| [#215](https://github.com/PJH720/VoiceVault/issues/215) | Whisper inference benchmarks and memory profiling |

---

## 🔭 Future — v0.9.0+

Ideas not yet scoped:

- **Speaker diarization** — who said what
- **Multilingual detection** — auto-detect language, route to correct Whisper model
- **Windows support** — Electrobun WebView2 backend
- **Mobile companion app** — sync recordings to/from iOS/Android
- **Encrypted vault** — SQLCipher or file-level encryption for recordings
- **Wake-word detection** — auto-start recording on keyword
- **Obsidian Community Plugin submission** — publish to official registry

---

## v1.0.0 — Obsidian Community Plugin (long-horizon)

The `v1.0.0 - Obsidian Community Plugin` milestone tracks the full plugin submission
to the Obsidian community registry. Gate: v0.8.0 IPC bridge (#222) must ship first.
