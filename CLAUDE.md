# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project Overview

VoiceVault — open-source AI voice recorder: transcribes, summarizes, and auto-organizes
recordings into structured notes, all on-device.

**v0.7.0 — pure Electrobun + Bun desktop app.** Electron has been fully removed.

| Layer | Path | Tech |
|---|---|---|
| Desktop main process | `src/main/` | Electrobun 1.15.1 + Bun + bun:sqlite |
| Renderer (UI) | `src/renderer/` | React 19 + Vite 6 + Tailwind CSS v4 + shadcn/ui |
| Shared types | `src/shared/` | TypeScript (consumed by both layers) |
| Python web app | `backend/`, `frontend/` | FastAPI + Next.js 16 (separate stack, unaffected) |
| Obsidian plugin | `plugin/` | TypeScript + esbuild |

---

## Commands

```bash
# ── Desktop app (pnpm / Bun) ─────────────────────────────────────────────────
pnpm dev            # Vite renderer (5173) + Electrobun launcher via scripts/dev-electrobun.sh
pnpm build          # vite build renderer + bun build src/main/main.ts → out/
pnpm lint           # ESLint (typescript-eslint + prettier rules)
pnpm typecheck      # tsc --noEmit (renderer, tsconfig.web.json)
pnpm typecheck:bun  # tsc --noEmit (main process, tsconfig.node.json)
pnpm test           # Vitest (tests/unit/)
pnpm test:watch     # Vitest watch mode
pnpm test:e2e       # Playwright (tests/e2e/app-launch.test.ts)
pnpm test:whisper   # bash scripts/test-whisper.sh — smoke test Whisper via HTTP RPC

pnpm package:linux  # pnpm build + electrobun package --platform linux
pnpm package:mac    # pnpm build + electrobun package --platform mac

# ── Python web app ────────────────────────────────────────────────────────────
make setup / make dev / make test / make lint
make up / make up-ollama    # Docker Compose
```

---

## Architecture — Desktop App (Electrobun)

```
Renderer (React 19 + Vite)          Main Process (Bun Worker)
  src/renderer/                        src/main/
  port 5173                            HTTP RPC port 50100

  window.api.*  ──────────────────────►  allRPCHandlers
  (via electrobun-bridge.ts)             src/main/rpc/{domain}.ts
                                         ▼
                                    Services
                                    src/main/services/
                                    ├── db.ts       (bun:sqlite WAL)
                                    ├── settings.ts (bun:sqlite-backed)
                                    ├── registry.ts (ServiceRegistry singleton)
                                    └── subprocess/
                                        ├── WhisperSubprocess.ts  (Bun.spawn)
                                        └── LlmSubprocess.ts      (Bun.spawn)
```

### Process model (Electrobun)

Electrobun runs two OS processes:

1. **Launcher** (Zig, GTK main thread) — creates the BrowserWindow, owns the GTK event loop.
   Do NOT run `bun run src/main/main.ts` directly — GTK FFI blocks Bun's event loop.
2. **Bun Worker** (`src/main/main.ts`) — HTTP RPC server + services + subprocesses.
   Launcher starts this worker; BrowserWindow navigates to `http://localhost:5173`.

**Build artifact naming:** Electrobun launcher always loads `app/bun/index.js`.
`bun build` outputs `main.js` — the dev script (`scripts/dev-electrobun.sh`) copies it:
```
out/electrobun/main/main.js  →  build/.../app/bun/index.js
```
Copy must happen BEFORE the launcher starts (no race condition).

### HTTP RPC (renderer ↔ main)

```typescript
// Renderer sends:
POST http://localhost:50100/rpc
{ "channel": "whisper:transcribe-file", "params": { "filePath": "..." } }

// Handler receives params as first arg:
async function handler(params: { filePath: string }) { ... }
```

Do NOT use `args` — the body key is `params`.

### Native integrations — `Bun.spawn` only

No N-API native modules. All heavy compute via subprocess:

| Capability | Binary | Wrapper |
|---|---|---|
| Speech-to-text | `whisper-cli` (Linuxbrew) | `WhisperSubprocess.ts` |
| Local LLM | `llama-cli` (Linuxbrew) | `LlmSubprocess.ts` |

Binary search order: `~/.local/share/VoiceVault/bin/` → `/home/linuxbrew/.linuxbrew/bin/` → `$PATH`.

**Model location:** `~/.voicevault/models/ggml-tiny.en.bin`
(symlinked from `~/.local/share/VoiceVault/models/` if migrating from Electron).

### Database

`bun:sqlite` (WAL mode) at `~/.voicevault/voicevault.db`.
Migration SQL files: `src/main/services/migrations/*.sql` (numbered, `001_init.sql` …).
`electron-store` and `better-sqlite3` are **removed** — do not re-introduce.

### Renderer bridge

`src/renderer/src/lib/electrobun-bridge.ts` — detects runtime, routes `window.api.*` calls
to HTTP RPC (Electrobun path) or native `window.api` passthrough (legacy/test).
`src/renderer/src/main.tsx` patches `window.api` at startup so all components work unchanged.

---

## Key Paths

```
src/
  main/                   Electrobun main process (Bun Worker)
    main.ts               Entry point — DB init, RPC server, BrowserWindow
    http-rpc.ts           HTTP RPC server (port 50100)
    types.ts              Shared types for main process
    rpc/                  One file per domain, barrel at rpc/index.ts
    services/
      db.ts               bun:sqlite WAL database
      settings.ts         Settings service (bun:sqlite-backed)
      registry.ts         ServiceRegistry — lazy singleton for subprocesses
      subprocess/
        WhisperSubprocess.ts
        LlmSubprocess.ts
  renderer/
    src/
      components/         React components (shadcn/ui primitives)
      contexts/           React Context for state
      hooks/              Custom hooks
      lib/
        electrobun-bridge.ts   ← RPC bridge (do not remove)
      pages/              Route-level pages
      main.tsx            Entry, window.api patching
  shared/                 Types + constants shared by main + renderer
    types.ts
    ipc-channels.ts       Channel name constants (use these — don't hardcode strings)

scripts/
  dev-electrobun.sh       Deterministic 5-step launcher startup (no race condition)
  test-whisper.sh         Whisper HTTP RPC smoke test

tests/
  unit/                   Vitest unit tests (renderer components, i18n, format utils)
  e2e/
    app-launch.test.ts    Playwright — verifies Electrobun build artifacts exist
```

---

## Code Conventions

**IPC (Critical):** Renderer has zero direct Bun/Node access. All cross-process calls
go through `window.api.*` → `electrobun-bridge.ts` → HTTP RPC. Channel names in
`src/shared/ipc-channels.ts`. Validate all RPC inputs in main process (assume renderer compromised).

**TypeScript:** Strict, no `any` (use `unknown` + narrowing). Explicit return types on exports.
Semicolons, single quotes. Two tsconfigs from root:
- `tsconfig.node.json` — covers `src/main/**` (Bun target)
- `tsconfig.web.json` — covers `src/renderer/**` (browser target, alias `@renderer/*`)

**React:** Functional components only. Context for state. Tailwind CSS v4 (no inline styles).
shadcn/ui primitives.

**i18n:** All strings via `react-i18next` `t()`. Korean (`ko`) primary; `en`/`ja` supported.
Key format: `namespace.section.key`. Run `pnpm check:translations` to verify coverage.

**Naming:**
- Components: `PascalCase.tsx`
- Services: `PascalCaseService.ts` or `camelCase.ts` (see existing pattern in `src/main/services/`)
- Hooks: `useX.ts`
- RPC channels: `domain:action` (e.g. `whisper:transcribe-file`)
- SQL: `snake_case`

**Logging:** `console.log('[ServiceName]', …)` with bracketed prefix.

**Database:** WAL mode, prepared statements, transactions for bulk writes. No ORMs.

**Subprocess pattern:**
```typescript
const proc = Bun.spawn(['whisper-cli', '--model', modelPath, audioPath], {
  stdout: 'pipe', stderr: 'pipe',
  env: { ...process.env, PATH: `${linuxbrewBin}:${process.env.PATH}` },
})
const output = await new Response(proc.stdout).text()
await proc.exited
```

**No `--define` for runtime env vars:** `--define "process.env.NODE_ENV=development"` inlines
a bare identifier without quotes → `ReferenceError`. Pass via launcher env exports instead.

**`pnpm install` in CI / non-TTY:** Use `--no-frozen-lockfile` when `package.json` changes significantly.

**Git:** Conventional commits — `feat(scope):`, `fix(scope):`, `refactor(scope):`, `test(scope):`, `chore(scope):`

---

## Removed — Do Not Re-Introduce

| Package | Replaced by |
|---|---|
| `electron` | `electrobun` |
| `electron-vite` | `vite` (direct) |
| `electron-store` | `bun:sqlite`-backed `settings.ts` |
| `better-sqlite3` | `bun:sqlite` |
| `node-llama-cpp` | `Bun.spawn llama-cli` |
| `whisper-cpp-node` | `Bun.spawn whisper-cli` |
| `@electron-toolkit/*` | Electrobun equivalents |
| `electron-builder` | `electrobun package` |

Do not `pnpm add electron*` or any N-API native binding packages.

---

## Python Web App (separate stack)

| Path | Tech |
|---|---|
| `backend/src/api/` | FastAPI routes + WebSocket |
| `backend/src/services/` | audio, transcription, summarization, classification, RAG, storage |
| `frontend/src/` | Next.js 16 App Router (Zustand stores, OpenAPI-generated types) |

The Python stack is unaffected by the Electrobun migration. See `Makefile` for dev/test/Docker targets.

---

## Platform Notes (Linux x64)

- Electrobun native wrapper: `libNativeWrapper.so` v1.0.2 (GTK WebKit, system webview)
- GTK 4 + WebKitGTK required: `libgtk-4-dev libwebkit2gtk-4.1-dev`
- Audio capture: browser `MediaRecorder` API (no kernel module needed)
- Linuxbrew prefix: `/home/linuxbrew/.linuxbrew/`
- Binaries installed via: `brew install whisper-cpp llama.cpp`
