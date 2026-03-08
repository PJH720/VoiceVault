# Development Guide

Contributing to VoiceVault — environment setup, code conventions, and workflow.

> **Stack:** Bun + Electrobun + TypeScript + React 19 + Vite + `bun:sqlite`.
> There is no Python, no Docker, and no Makefile.

---

## Environment Setup

### 1. System Dependencies (Linux)

```bash
# GTK 4 + WebKitGTK (required for Electrobun window)
sudo apt install libgtk-4-dev libwebkit2gtk-4.1-dev libglib2.0-dev

# Linuxbrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# AI binaries (compiled from source — takes 5–10 min each)
brew install whisper-cpp llama.cpp
```

### 2. JavaScript Tooling

```bash
# Bun runtime
curl -fsSL https://bun.sh/install | bash

# pnpm (package manager)
npm install -g pnpm

# Install project dependencies
pnpm install
```

### 3. Models

```bash
mkdir -p ~/.voicevault/models

# Whisper (75 MB)
wget -O ~/.voicevault/models/ggml-tiny.en.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin

# LLM — download a GGUF model and place in ~/.voicevault/models/
```

---

## Development Commands

```bash
pnpm dev             # Vite renderer (5173) + Electrobun launcher
pnpm build           # Full build → out/
pnpm test            # Vitest unit tests
pnpm test:watch      # Vitest watch mode
pnpm test:e2e        # Playwright E2E (requires built app)
pnpm test:whisper    # HTTP RPC smoke test (requires running app)
pnpm lint            # ESLint + Prettier
pnpm typecheck       # tsc (renderer — tsconfig.web.json)
pnpm typecheck:bun   # tsc (main process — tsconfig.node.json)
```

### Dev Launch Internals

`pnpm dev` runs `scripts/dev-electrobun.sh`, which follows a deterministic 5-step sequence:

1. `bun build src/main/main.ts → out/electrobun/main/main.js`
2. Copy `main.js → build/.../app/bun/index.js` (launcher always loads `index.js`)
3. Kill any stale electrobun dev processes
4. Start Vite renderer (port 5173)
5. Start Electrobun launcher

The copy step **must** happen before the launcher starts to avoid a race condition.

---

## Code Conventions

### TypeScript

- **Strict mode** — no `any` (use `unknown` + narrowing)
- Explicit return types on all exported functions
- Two tsconfigs:
  - `tsconfig.node.json` — `src/main/**` (Bun runtime target)
  - `tsconfig.web.json` — `src/renderer/**` (browser target, alias `@renderer/*`)

### React (Renderer)

- Functional components only — no class components
- State via React Context — no Redux/Zustand
- Tailwind CSS v4 — no inline `style={{}}` objects
- shadcn/ui primitives for all UI elements
- All strings via `react-i18next` `t()` — Korean (`ko`) primary, `en`/`ja` supported

### IPC (Cross-Process)

The renderer has **zero** direct access to Bun/Node APIs. Every cross-process call goes:

```
window.api.domain.method(params)
    → electrobun-bridge.ts
    → POST http://localhost:50100/rpc { channel, params }
    → rpc/domain.ts handler(params)
```

- Channel names: always use constants from `src/shared/ipc-channels.ts`
- Validate ALL RPC inputs in main process using `src/main/utils/validate.ts`
- Treat renderer as untrusted — validate even if the UI sends "clean" data

### Subprocess Pattern

```typescript
import { resolveBinary, resolveModel, spawnEnv } from '../utils/subprocess'

const binary = resolveBinary('whisper-cli')   // searches bundled → linuxbrew → $PATH
const model  = resolveModel('ggml-tiny.en')   // resolves ~/.voicevault/models/

const proc = Bun.spawn([binary, '--model', model, audioPath], {
  stdout: 'pipe',
  stderr: 'pipe',
  env: spawnEnv(),   // process.env + Linuxbrew PATH prepended
})
const output = await new Response(proc.stdout).text()
await proc.exited
```

### Validation Pattern

```typescript
import { assertFiniteId, assertNonEmptyString } from '../utils/validate'

async function handleMyRpc(params: unknown): Promise<Result> {
  assertFiniteId((params as any)?.recordingId)
  assertNonEmptyString((params as any)?.filePath)
  // now safe to use
}
```

### Database Pattern

```typescript
import { getDb } from '../services/db'

const db = getDb()

// Prepared statement
const stmt = db.prepare('SELECT * FROM recordings WHERE id = ?')
const row  = stmt.get(id) as RecordingRow | null

// Transaction for bulk writes
db.transaction(() => {
  for (const seg of segments) {
    insertSegment.run(seg.text, seg.start, seg.end, seg.recordingId)
  }
})()
```

### Naming

| Thing | Convention |
|---|---|
| Components | `PascalCase.tsx` |
| Services | `PascalCase.ts` or `camelCase.ts` |
| Hooks | `useX.ts` |
| RPC channels | `domain:action` (e.g. `whisper:transcribe-file`) |
| SQL columns | `snake_case` |
| Log prefix | `[ServiceName]` (e.g. `[WhisperSubprocess]`) |

### Git

Conventional commits, one logical unit per commit:

```
feat(scope):     new feature
fix(scope):      bug fix
refactor(scope): restructure, no behavior change
test(scope):     tests only
chore(scope):    tooling, deps, config
docs(scope):     documentation only
```

Never `git add -A` — always stage selectively. Untracked artifacts exist in the repo root that should not be committed.

---

## Adding a New RPC Handler

1. Add the channel constant to `src/shared/ipc-channels.ts`
2. Add the corresponding `window.api.*` call to `src/renderer/src/lib/electrobun-bridge.ts`
3. Create or extend a handler file in `src/main/rpc/`
4. Register the handler in `src/main/rpc/index.ts`
5. Add input validation using `src/main/utils/validate.ts`
6. Write a unit test if the logic is non-trivial

---

## Testing

### Unit Tests (Vitest)

```bash
pnpm test
# → tests/unit/**/*.test.{ts,tsx}
# Current: 6 files, 9 tests
```

Test environments:
- `tests/unit/renderer/` → `jsdom` (browser DOM)
- Everything else → `node`

### E2E Tests (Playwright)

```bash
pnpm test:e2e
# → tests/e2e/app-launch.test.ts
# Verifies build artifacts exist and launcher can start
```

### Whisper Smoke Test

```bash
pnpm test:whisper
# → scripts/test-whisper.sh
# Requires a running VoiceVault instance (pnpm dev in another terminal)
```

---

## Do Not Re-Introduce

| Package | Replaced by |
|---|---|
| `electron`, `electron-vite`, `electron-builder` | `electrobun` |
| `electron-store` | `bun:sqlite`-backed `settings.ts` |
| `better-sqlite3` | `bun:sqlite` |
| `node-llama-cpp` | `Bun.spawn llama-cli` |
| `whisper-cpp-node` | `Bun.spawn whisper-cli` |
| Any Python package | N/A — no Python in this project |
| `docker-compose.yml`, `Makefile`, `Dockerfile` | N/A — deleted |
