# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VoiceVault is a cross-platform Electron desktop app that records, transcribes, summarizes, and auto-organizes voice recordings into structured notes — all on-device, no server required.

**Stack:** Electron 39 + React 19 + TypeScript 5 + electron-vite + Tailwind CSS v4 + shadcn/ui + pnpm

## Build & Run

```bash
pnpm install
pnpm dev          # Development with hot reload
pnpm build        # Production build (runs typecheck first)
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check (both node + web configs)
```

## Testing

```bash
pnpm test                           # All unit tests (Vitest)
pnpm test:watch                     # Watch mode
npx vitest run tests/unit/WhisperService.test.ts  # Single test file
pnpm test:e2e                       # Playwright E2E (needs built app)
```

- Unit tests: `tests/unit/` — Vitest with `globals: true`
- Renderer tests (`tests/unit/renderer/**/*.test.tsx`): auto-switched to jsdom environment
- E2E tests: `tests/e2e/` — Playwright with Electron support (`_electron.launch()`)
- Native modules (`whisper-cpp-node`, `better-sqlite3`, etc.) are mocked via `vi.mock()`

## Architecture

### Three-Process Model (Electron)

```
Renderer (React UI)  ←→  Preload (contextBridge)  ←→  Main (Node.js + Native)
   window.api.*              src/preload/              src/main/services/
   src/renderer/             index.ts                  src/main/ipc/
```

**All heavy compute runs in main process.** The renderer is a thin UI layer with zero Node.js access.

### Key Directories

- `src/main/services/` — Service classes wrapping native modules (WhisperService, LLMService, DatabaseService, etc.)
- `src/main/ipc/` — IPC handler registrations, one file per domain (audio, transcription, summarization, etc.)
- `src/main/migrations/` — Numbered SQL migration files (`001_init.sql`, `002_transcripts.sql`, ...) run by DatabaseService
- `src/preload/index.ts` — The **only** bridge between main and renderer. Exposes typed `window.api.*`
- `src/renderer/src/components/` — React components grouped by feature (Recording, Library, Summary, etc.)
- `src/renderer/src/contexts/` — React Context providers (state management, no Redux/Zustand)
- `src/renderer/src/hooks/` — Custom hooks that abstract IPC calls (`useRecording`, `useTranscription`, etc.)
- `src/shared/types.ts` — Shared TypeScript types across all processes
- `src/shared/ipc-channels.ts` — All IPC channel name constants (grouped as `AudioChannels`, `DatabaseChannels`, etc.)
- `resources/templates/` — Built-in classification templates (JSON) and Obsidian export templates (Markdown)

### ServiceRegistry (Singleton)

`src/main/services/ServiceRegistry.ts` — Lazy-creates and caches service instances (LLM, Whisper, Embedding, Diarization, Translation). Prevents double model loading. Access via `ServiceRegistry.getLLMService()`, etc. Call `ServiceRegistry.cleanup()` on app quit.

### Data Flow

Audio capture → WhisperService (transcription) → SQLite (segments) → LLMService (summarization every 60s + on stop) → Classification → Obsidian export. RAG search embeds segments via VectorService for semantic search.

### TypeScript Configuration

Two separate tsconfigs referenced from the root `tsconfig.json`:
- `tsconfig.node.json` — Main + preload processes (extends `@electron-toolkit/tsconfig/tsconfig.node.json`)
- `tsconfig.web.json` — Renderer process (extends `@electron-toolkit/tsconfig/tsconfig.web.json`, path alias `@renderer/*`)

The renderer also has a Vite alias: `@renderer` → `src/renderer/src` (configured in `electron.vite.config.ts`).

## Code Conventions

### IPC Rules (Critical)
- **Never expose Node.js APIs to renderer** — all communication goes through `src/preload/index.ts` contextBridge
- **No `ipcRenderer` in renderer code** — only `window.api.*`
- **All IPC channel names** defined as constants in `src/shared/ipc-channels.ts`
- **Validate all IPC inputs** in main process handlers (assume renderer is compromised)

### TypeScript
- Strict mode, no `any` (use `unknown` + narrowing)
- Explicit return types on exported functions
- Semicolons, single quotes

### React
- Functional components only, React Context for state (no Redux)
- Tailwind CSS for styling (no inline styles, no CSS modules)
- shadcn/ui for UI primitives (`src/renderer/src/components/ui/`)

### i18n
- All user-facing strings use `react-i18next` `t()` — no hardcoded strings
- Korean (`ko`) is primary locale; English (`en`) and Japanese (`ja`) supported
- Locale files in `src/renderer/src/i18n/locales/`
- Translation key format: `namespace.section.key` (e.g., `recording.controls.start`)
- Run `pnpm check:translations` to verify translation completeness

### Naming
- Components: `PascalCase.tsx` — Services: `PascalCaseService.ts`
- Hooks: `useHookName.ts` — IPC channels: `domain:action` kebab-case
- SQL columns: `snake_case` — TypeScript types/interfaces: `PascalCase`

### Database
- SQLite via `better-sqlite3` with WAL mode
- Migrations are numbered SQL files in `src/main/migrations/` (run sequentially on init)
- Use prepared statements, wrap bulk writes in transactions

### Git Commits
Conventional commits: `feat(scope):`, `fix(scope):`, `refactor(scope):`, `test(scope):`, `chore(scope):`

## Key Technical Notes

- **whisper-cpp-node@0.2.9 API:** Uses `createWhisperContext()` / `transcribeAsync()` / `ctx.free()`. Segments return `{start: "HH:MM:SS,mmm", end, text}` strings that get parsed to float seconds. Confidence defaults to 0.9 (not provided by native API).
- **node-llama-cpp** handles local GGUF model inference for summarization and classification.
- **electron-store** persists user settings (model paths, locale, etc.) in `src/main/store.ts`.
- Several services are coded but have uninstalled native deps: `pyannote-cpp-node` (diarization), `native-audio-node` (system audio capture).

## Electrobun Migration (Phase 1 — Scaffold)

**Branch:** `feat/electrobun-migration`

VoiceVault is being migrated from Electron to [Electrobun](https://github.com/blackboardsh/electrobun) — a desktop framework using Bun + Zig with a system webview. The existing `src/main/` Electron code is preserved; the new Electrobun main process lives in `src/electrobun/`.

### Electrobun Dev Commands

```bash
bun run dev:electrobun       # Dev with hot reload (Vite renderer + Bun main)
bun run build:electrobun     # Production build
bun run build:electrobun:linux  # Package for Linux
bun run build:electrobun:mac    # Package for macOS
bun run build:electrobun:win    # Package for Windows
```

### Key Architectural Differences from Electron

| Concern | Electron (`src/main/`) | Electrobun (`src/electrobun/`) |
|---|---|---|
| Runtime | Node.js | Bun |
| IPC | `ipcMain.handle` + `contextBridge` preload | Electrobun typed RPC (`BrowserView.defineRPC`) |
| SQLite | `better-sqlite3` | `bun:sqlite` (built-in) |
| Settings store | `electron-store` | `bun:sqlite`-backed `settings.ts` |
| Whisper STT | `whisper-cpp-node` (native module) | `Bun.spawn` subprocess (`whisper-cli`) |
| LLM inference | `node-llama-cpp` (native module) | `Bun.spawn` subprocess (`llama-cli`) |
| Window | `BrowserWindow` (Chromium) | `BrowserWindow` (system webview) |
| Renderer | Stays 100% intact (React 19 + Vite + Tailwind) | Same |

### Electrobun Directory Structure

```
src/electrobun/
├── main.ts              # App entry point
├── types.ts             # Electrobun-specific type augmentations
├── rpc/                 # Typed RPC handlers (replaces src/main/ipc/)
│   ├── index.ts         # Barrel — combines all handlers into allRPCHandlers
│   ├── audio.ts         # Audio capture
│   ├── database.ts      # CRUD recordings, segments, speakers
│   ├── transcription.ts # Whisper subprocess
│   ├── summarization.ts # LLM subprocess summarization
│   ├── classification.ts# Template classification
│   ├── cloud-llm.ts     # Cloud LLM (Anthropic/OpenAI/Gemini)
│   ├── diarization.ts   # Speaker diarization
│   ├── rag.ts           # RAG search
│   ├── export.ts        # Obsidian export
│   ├── system-audio.ts  # System audio capture
│   └── translation.ts   # Translation
└── services/
    ├── db.ts            # bun:sqlite singleton + migrations
    ├── settings.ts      # bun:sqlite-backed settings
    ├── registry.ts      # ServiceRegistry for subprocess services
    └── subprocess/
        ├── WhisperSubprocess.ts  # Bun.spawn whisper-cli wrapper
        └── LlmSubprocess.ts     # Bun.spawn llama-cli wrapper
```

### Migration Status

- [x] Phase 1: Scaffold (directory structure, all RPC handlers, services, subprocess wrappers)
- [ ] Phase 2: Renderer bridge (connect React app to Electrobun RPC)
- [ ] Phase 3: Native integration (audio capture, model downloads)
- [ ] Phase 4: Packaging and distribution
