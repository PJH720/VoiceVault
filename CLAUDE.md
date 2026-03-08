# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VoiceVault — open-source AI voice recorder: transcribes, summarizes, and auto-organizes recordings into structured notes, all on-device.

**Two parallel stacks** in this repo:

| Stack | Path | Tech |
|---|---|---|
| Electron desktop app | `src/main/`, `src/preload/`, `src/renderer/`, `src/shared/` | Electron 39 + React 19 + TS 5 + electron-vite + Tailwind v4 + shadcn/ui + pnpm |
| Python web app | `backend/`, `frontend/` | FastAPI + Next.js 16 + Python 3.12 + Zustand + ChromaDB |
| Electrobun migration (WIP) | `src/electrobun/` | Bun + system webview (replaces Electron main process) |

## Commands

```bash
# ── Electron (pnpm) ──────────────────────────────────
pnpm dev / pnpm build / pnpm lint / pnpm typecheck
pnpm test                           # Vitest unit tests
pnpm test:watch                     # watch mode
npx vitest run tests/unit/Foo.test.ts  # single file
pnpm test:e2e                       # Playwright (needs built app)
pnpm check:translations             # i18n completeness

# ── Python web app (Makefile) ────────────────────────
make setup / make dev / make dev-backend / make dev-frontend
make test / make test-backend / make test-frontend / make lint
make gen-openapi / make gen-types   # OpenAPI → TS types
make up / make up-ollama            # Docker

# ── Electrobun (bun) ────────────────────────────────
bun run dev:electrobun              # Vite renderer + Bun main
bun run build:electrobun            # production build
```

## Architecture

### Electron: Three-Process Model

```
Renderer (React UI)  <-->  Preload (contextBridge)  <-->  Main (Node.js + Native)
   window.api.*              src/preload/index.ts          src/main/services/
   src/renderer/                                           src/main/ipc/
```

All heavy compute in main process. Renderer is a thin UI layer with zero Node.js access.

**Key paths (Electron):**
- `src/main/services/` — Native module wrappers (Whisper, LLM, Database, Vector, Export)
- `src/main/ipc/` — IPC handlers, one file per domain
- `src/main/migrations/` — Numbered SQL files (`001_init.sql`, …)
- `src/preload/index.ts` — **Only** bridge; exposes typed `window.api.*`
- `src/renderer/src/{components,contexts,hooks}/` — React UI (Context for state, no Redux)
- `src/shared/types.ts` + `src/shared/ipc-channels.ts` — Shared types & channel constants

**Key paths (Python):**
- `backend/src/api/` — FastAPI routes + WebSocket
- `backend/src/services/` — audio, transcription, summarization, classification, RAG, storage
- `frontend/src/` — Next.js App Router (Zustand stores, OpenAPI-generated types)

**ServiceRegistry** (`src/main/services/ServiceRegistry.ts`): Lazy singleton for LLM, Whisper, Embedding, Diarization, Translation. Call `ServiceRegistry.cleanup()` on quit.

**Data flow:** Audio → WhisperService → SQLite segments → LLMService (summarize every 60s + on stop) → Classification → Obsidian export. RAG embeds via VectorService.

**TypeScript:** Two tsconfigs from root — `tsconfig.node.json` (main+preload), `tsconfig.web.json` (renderer, alias `@renderer/*`). Vite alias: `@renderer` → `src/renderer/src`.

## Code Conventions

**IPC (Critical):** Never expose Node.js to renderer. No `ipcRenderer` in renderer — only `window.api.*`. All channel names in `src/shared/ipc-channels.ts`. Validate all IPC inputs in main (assume renderer compromised).

**TypeScript:** Strict, no `any` (use `unknown`+narrowing). Explicit return types on exports. Semicolons, single quotes.

**React:** Functional components only. Context for state in Electron app; Zustand in Next.js. Tailwind CSS (no inline styles). shadcn/ui primitives.

**i18n:** All strings via `react-i18next` `t()`. Korean (`ko`) primary; `en`/`ja` supported. Keys: `namespace.section.key`.

**Naming:** Components `PascalCase.tsx`, Services `PascalCaseService.ts`, Hooks `useX.ts`, IPC `domain:action`, SQL `snake_case`.

**Logging:** `console.log('[ServiceName]', …)` with bracketed prefix.

**Database:** `better-sqlite3` WAL (Electron), `bun:sqlite` (Electrobun), async SQLAlchemy+aiosqlite (backend). Numbered migration SQL files. Prepared statements, transactions for bulk writes.

**Git:** Conventional commits — `feat(scope):`, `fix(scope):`, `refactor(scope):`, `test(scope):`, `chore(scope):`

## Key Technical Notes

- **whisper-cpp-node@0.2.9:** `createWhisperContext()` / `transcribeAsync()` / `ctx.free()`. Segments return `{start: "HH:MM:SS,mmm", end, text}` strings parsed to float seconds. Confidence defaults 0.9.
- **node-llama-cpp:** Local GGUF model inference for summarization/classification.
- **electron-store:** User settings in `src/main/store.ts`.
- Uninstalled native deps exist in code: `pyannote-cpp-node` (diarization), `native-audio-node` (system audio).
- **Linux:** Requires `libasound2-dev libpulse-dev` (Debian) or `alsa-lib-devel pulseaudio-libs-devel` (Fedora).

## Electrobun Migration

**Branch:** `feat/electrobun-migration` — migrating from Electron to [Electrobun](https://github.com/blackboardsh/electrobun) (Bun+Zig, system webview). Existing `src/main/` preserved.

| Concern | Electron | Electrobun |
|---|---|---|
| Runtime | Node.js | Bun |
| IPC | `ipcMain.handle` + contextBridge | `BrowserView.defineRPC` + HTTP/WS bridge |
| SQLite | `better-sqlite3` | `bun:sqlite` |
| Settings | `electron-store` | `bun:sqlite`-backed `settings.ts` |
| Whisper/LLM | Native modules | `Bun.spawn` subprocess (whisper-cli/llama-cli) |

**Directory:** `src/electrobun/` — `main.ts` (entry), `http-rpc.ts` (HTTP+WS server), `types.ts`, `rpc/` (11 domain handlers + barrel), `services/` (db, settings, registry, subprocess wrappers).

**Renderer bridge:** `src/renderer/src/lib/electrobun-bridge.ts` — detects runtime, routes to HTTP RPC (Electrobun) or `window.api` passthrough (Electron). `main.tsx` patches `window.api` so components work unchanged.

**Status:** Phase 1 (scaffold) ✓ · Phase 2 (renderer bridge + WebAudio audit) ✓ · Phase 3 (native integration) TODO · Phase 4 (packaging) TODO
