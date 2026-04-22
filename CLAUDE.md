# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project Overview

VoiceVault — open-source AI voice recorder desktop app: transcribes, summarizes, and auto-organizes
recordings into structured notes, all on-device.

**v0.7.0 — pure Electrobun + Bun standalone desktop app.** Electron has been fully removed.
There is no Python backend, no Next.js frontend, no Docker, and no Makefile. This is a single
self-contained desktop app.

| Layer | Path | Tech |
|---|---|---|
| Desktop main process | `src/main/` | Electrobun 1.15.1 + Bun + bun:sqlite |
| Renderer (UI) | `src/renderer/` | React 19 + Vite 7 + Tailwind CSS v4 + shadcn/ui + react-router-dom |
| Shared types | `src/shared/` | TypeScript (consumed by both layers) |
| Templates | `templates/` | Handlebars-based classification templates |
| Obsidian plugin | `plugin/` | TypeScript + esbuild |

---

## Commands

```bash
# ── Development ──────────────────────────────────────────────────────────────
pnpm dev            # Vite renderer (5173) + Electrobun launcher via scripts/dev-electrobun.sh
                    # predev hook auto-kills stale processes on ports 50100/5173
pnpm build          # vite build renderer + bun build src/main/main.ts → out/

# ── Quality ───────────────────────────────────────────────────────────────────
pnpm lint           # ESLint (typescript-eslint + prettier rules)
pnpm format         # Prettier --write
pnpm typecheck      # tsc --noEmit (renderer, tsconfig.web.json)
pnpm typecheck:bun  # tsc --noEmit (main process, tsconfig.node.json)
pnpm check:translations  # Verify i18n key consistency across locales

# ── Testing ───────────────────────────────────────────────────────────────────
pnpm test           # Vitest unit tests (tests/unit/)
pnpm test:watch     # Vitest watch mode
pnpm test:e2e       # Playwright (tests/e2e/app-launch.test.ts)
pnpm test:whisper   # bash scripts/test-whisper.sh — smoke test Whisper via HTTP RPC

# Run a single test file:
#   pnpm test -- tests/unit/format.test.ts

# ── Packaging ─────────────────────────────────────────────────────────────────
pnpm package:linux  # pnpm build + electrobun build --env=stable
pnpm package:mac    # pnpm build + electrobun build --env=stable
pnpm package:dev    # electrobun build --env=dev (no pnpm build, faster iteration)
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

Body key is `params`, NOT `args`. Handlers receive a single `params` object.

### Native integrations — `Bun.spawn` only

No N-API native modules. All heavy compute via subprocess:

| Capability | Binary | Wrapper |
|---|---|---|
| Speech-to-text | `whisper-cli` (Linuxbrew / Homebrew) | `WhisperSubprocess.ts` |
| Local LLM | `llama-cli` (Linuxbrew / Homebrew) | `LlmSubprocess.ts` |

Binary search order: `~/.local/share/VoiceVault/bin/` → `/home/linuxbrew/.linuxbrew/bin/` → `$PATH`.

### Cloud LLM providers (optional)

For summarization, VoiceVault also supports cloud APIs as alternatives to local `llama-cli`:

| Provider | SDK | Env var |
|---|---|---|
| Anthropic | `@anthropic-ai/sdk` | `ANTHROPIC_API_KEY` |
| OpenAI | `openai` | `OPENAI_API_KEY` |
| Google | `@google/generative-ai` | `GOOGLE_API_KEY` |

No API keys are required — local `llama-cli` is the default path.

Model location: `~/.voicevault/models/`
- Whisper: `ggml-<size>.bin` (e.g. `ggml-tiny.en.bin`)
- LLM: `<name>.gguf` (e.g. `gemma-2-3n-instruct-q4_k_m.gguf`)

### Database

`bun:sqlite` (WAL mode) at `~/.voicevault/voicevault.db`.
Migration SQL files: `src/main/services/migrations/*.sql` (numbered, `001_init.sql` …).

### Renderer bridge

`src/renderer/src/lib/electrobun-bridge.ts` — detects runtime, routes `window.api.*` calls
to HTTP RPC. `src/renderer/src/main.tsx` patches `window.api` at startup so all components
work unchanged.

---

## Key Paths

```
src/
  main/                      Electrobun main process (Bun Worker)
    main.ts                  Entry point — DB init, RPC server, BrowserWindow
    http-rpc.ts              HTTP RPC server (port 50100)
    types.ts                 Shared types for main process
    rpc/                     One file per domain, barrel at rpc/index.ts
    services/
      db.ts                  bun:sqlite WAL database
      settings.ts            Settings service (bun:sqlite-backed)
      registry.ts            ServiceRegistry — lazy singleton for subprocesses
      subprocess/
        WhisperSubprocess.ts
        LlmSubprocess.ts
    utils/
      subprocess.ts          resolveBinary / resolveModel / spawnEnv / downloadFile
      validate.ts            assertFiniteId / assertNonEmptyString / assertString / assertBoolean

  renderer/
    src/
      components/            React components (shadcn/ui primitives)
      contexts/              React Context for state
      hooks/                 Custom hooks
      lib/
        electrobun-bridge.ts ← RPC bridge (do not remove)
      pages/                 Route-level pages
      main.tsx               Entry, window.api patching

  shared/                    Types + constants shared by main + renderer
    types.ts
    constants.ts             APP_VERSION + other app-wide constants
    ipc-channels.ts          Channel name constants (use these — don't hardcode strings)

scripts/
  dev-electrobun.sh          Deterministic 5-step launcher startup (no race condition)
  test-whisper.sh            Whisper HTTP RPC smoke test

templates/                   Classification template JSON files (meeting, lecture, memo…)

tests/
  unit/                      Vitest unit tests (renderer components, i18n, format utils)
    renderer/                Component tests (jsdom environment)
    format.test.ts
    i18n-locales.test.ts
  e2e/
    app-launch.test.ts       Playwright — verifies Electrobun build artifacts exist

plugin/                      Obsidian community plugin
  manifest.json
  esbuild.config.mjs
```

---

## Code Conventions

**IPC (Critical):** Renderer has zero direct Bun/Node access. All cross-process calls
go through `window.api.*` → `electrobun-bridge.ts` → HTTP RPC. Channel names in
`src/shared/ipc-channels.ts`. Validate all RPC inputs in main process (assume renderer untrusted).

**TypeScript:** Strict, no `any` (use `unknown` + narrowing). Explicit return types on exports.
Semicolons, single quotes. Two tsconfigs from root:
- `tsconfig.node.json` — covers `src/main/**` (Bun target)
- `tsconfig.web.json` — covers `src/renderer/**` (browser target, alias `@renderer/*`)

**React:** Functional components only. Context for state. Tailwind CSS v4 (no inline styles).
shadcn/ui primitives.

**i18n:** All strings via `react-i18next` `t()`. Korean (`ko`) primary; `en`/`ja` supported.
Key format: `namespace.section.key`.

**Naming:**
- Components: `PascalCase.tsx`
- Services: `PascalCase.ts` or `camelCase.ts`
- Hooks: `useX.ts`
- RPC channels: `domain:action` (e.g. `whisper:transcribe-file`)
- SQL: `snake_case`

**Logging:** `console.log('[ServiceName]', …)` with bracketed prefix.

**Database:** WAL mode, prepared statements, transactions for bulk writes. No ORMs.

**Subprocess pattern:**
```typescript
import { resolveBinary, spawnEnv } from '../utils/subprocess'

const binary = resolveBinary('whisper-cli')
const proc = Bun.spawn([binary, '--model', modelPath, audioPath], {
  stdout: 'pipe',
  stderr: 'pipe',
  env: spawnEnv(),
})
const output = await new Response(proc.stdout).text()
await proc.exited
```

**Validation pattern:**
```typescript
import { assertFiniteId, assertNonEmptyString } from '../utils/validate'

function handler(params: unknown) {
  assertFiniteId((params as any)?.id)           // throws with 400 on failure
  assertNonEmptyString((params as any)?.path)
}
```

**No `--define` for runtime env vars:** `--define "process.env.NODE_ENV=development"` inlines
a bare identifier without quotes → `ReferenceError`. Pass via launcher env exports instead.

**`git add` discipline:** Only stage files in `src/main/`, `src/renderer/`, `src/shared/`,
`tests/unit/`, `scripts/`, `templates/`, or project config files. Never `git add -A`.

**Git:** Conventional commits — `feat(scope):`, `fix(scope):`, `refactor(scope):`, `test(scope):`, `chore(scope):`

---

## Removed — Do Not Re-Introduce

| Package / artifact | Replaced by |
|---|---|
| `electron` | `electrobun` |
| `electron-vite` | `vite` (direct) |
| `electron-store` | `bun:sqlite`-backed `settings.ts` |
| `better-sqlite3` | `bun:sqlite` |
| `node-llama-cpp` | `Bun.spawn llama-cli` |
| `whisper-cpp-node` | `Bun.spawn whisper-cli` |
| `@electron-toolkit/*` | Electrobun equivalents |
| `electron-builder` | `electrobun package` |
| Python backend (`backend/`, `src/api/`, `src/core/`, `src/services/`) | N/A — removed entirely |
| Next.js frontend (`frontend/`) | N/A — removed entirely |
| `Dockerfile`, `docker-compose.yml`, `Makefile` | N/A — removed entirely |
| `pyproject.toml`, `pytest.ini`, `requirements.txt` | N/A — removed entirely |

Do not `pnpm add electron*`, any N-API native binding packages, or any Python tooling.

---

## Platform Notes

### Linux x64
- Electrobun native wrapper: `libNativeWrapper.so` v1.0.2 (GTK WebKit, system webview)
- GTK 4 + WebKitGTK required: `sudo apt install libgtk-4-dev libwebkit2gtk-4.1-dev`
- Linuxbrew prefix: `/home/linuxbrew/.linuxbrew/`

### macOS (Apple Silicon / Intel)
- Electrobun uses system WebKit via native wrapper
- Binaries installed via: `brew install whisper-cpp llama.cpp`

### Both platforms
- Audio capture: browser `MediaRecorder` API (no kernel module needed)
- Symlinks in repo root (`libasar.so`, `libNativeWrapper.so`, etc.) point into `node_modules/electrobun/` — do not delete

### Stale Cursor rules warning

`.cursor/rules/` files reference Electron, better-sqlite3, electron-store, and other removed packages.
They are **outdated** and should not be trusted. This CLAUDE.md is the authoritative guide.
