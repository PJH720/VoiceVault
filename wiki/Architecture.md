# Architecture

VoiceVault v0.7.0 is a pure Electrobun desktop application. This page documents
the actual architecture — no Python, no Docker, no Electron IPC.

---

## Process Model

Electrobun runs two OS processes:

```
┌──────────────────────────────────────────────────────────────────┐
│  Launcher process (Zig binary)                                   │
│  ─ Owns the GTK event loop (Linux) / Cocoa (macOS)              │
│  ─ Creates BrowserWindow → loads http://localhost:5173           │
│  ─ Starts the Bun Worker as a subprocess                        │
└───────────────────────┬──────────────────────────────────────────┘
                        │ launches
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│  Bun Worker  (src/main/main.ts)                                  │
│  ─ HTTP RPC server on port 50100                                 │
│  ─ bun:sqlite database                                          │
│  ─ Service registry (Whisper, LLM subprocesses)                 │
│  ─ ALL business logic                                           │
└──────────────────────────────────────────────────────────────────┘
```

> **Critical:** Never run `bun run src/main/main.ts` directly. GTK FFI on the launcher
> side blocks Bun's event loop when called from Bun directly. The launcher must start the
> Bun Worker — see `scripts/dev-electrobun.sh` for the deterministic 5-step startup sequence.

---

## Source Tree

```
VoiceVault/
├── src/
│   ├── main/                          # Bun Worker (main process)
│   │   ├── main.ts                    # Entry — DB init, RPC server, BrowserWindow
│   │   ├── http-rpc.ts                # HTTP RPC server (port 50100)
│   │   ├── types.ts                   # Main-process-internal types
│   │   ├── rpc/                       # One handler file per domain
│   │   │   ├── index.ts               # Barrel — registers all handlers
│   │   │   ├── audio.ts
│   │   │   ├── transcription.ts
│   │   │   ├── summarization.ts
│   │   │   ├── classification.ts
│   │   │   ├── database.ts
│   │   │   ├── diarization.ts
│   │   │   ├── export.ts
│   │   │   ├── rag.ts
│   │   │   ├── system-audio.ts
│   │   │   ├── cloud-llm.ts
│   │   │   └── translation.ts
│   │   ├── services/
│   │   │   ├── db.ts                  # bun:sqlite WAL database singleton
│   │   │   ├── settings.ts            # Settings (bun:sqlite-backed; replaces electron-store)
│   │   │   ├── registry.ts            # ServiceRegistry — lazy singletons
│   │   │   └── subprocess/
│   │   │       ├── WhisperSubprocess.ts  # Bun.spawn whisper-cli
│   │   │       └── LlmSubprocess.ts      # Bun.spawn llama-cli
│   │   └── utils/
│   │       ├── subprocess.ts          # resolveBinary / resolveModel / spawnEnv / downloadFile
│   │       └── validate.ts            # assertFiniteId / assertNonEmptyString / …
│   ├── renderer/                      # React 19 + Vite (served on port 5173)
│   │   └── src/
│   │       ├── main.tsx               # Entry — patches window.api at startup
│   │       ├── lib/
│   │       │   └── electrobun-bridge.ts  # Routes window.api.* → HTTP RPC
│   │       ├── components/            # shadcn/ui primitives + app components
│   │       ├── contexts/              # React Context (state)
│   │       ├── hooks/                 # Custom hooks
│   │       ├── pages/                 # Route-level pages
│   │       └── i18n/                  # Translations (ko / en / ja)
│   └── shared/                        # Shared by main + renderer
│       ├── types.ts                   # Cross-process type definitions
│       ├── constants.ts               # APP_VERSION + app-wide constants
│       └── ipc-channels.ts            # Channel name constants (use these, not strings)
├── templates/                         # Classification template JSON files
├── plugin/                            # Obsidian community plugin
├── scripts/
│   ├── dev-electrobun.sh              # Deterministic dev launch (5 steps, no race condition)
│   └── test-whisper.sh                # Whisper HTTP RPC smoke test
├── tests/
│   ├── unit/                          # Vitest (renderer components, i18n, format)
│   └── e2e/
│       └── app-launch.test.ts         # Playwright — verifies build artifacts
├── electrobun.config.ts
├── package.json
└── pnpm-lock.yaml
```

---

## HTTP RPC — Renderer ↔ Main

Electron IPC is gone. All cross-process communication is HTTP POST.

```
Renderer (React 19)                    Main Process (Bun Worker)
  window.api.whisper.transcribeFile()
        │
        ▼
  electrobun-bridge.ts
        │
        ▼ POST http://localhost:50100/rpc
  { "channel": "whisper:transcribe-file",
    "params": { "filePath": "/tmp/clip.wav" } }
        │
        ▼
  http-rpc.ts  →  rpc/index.ts  →  rpc/transcription.ts
        │
        ▼ JSON response
  { result: [...segments] }
```

**Rules:**
- Body key is `params` (not `args`)
- Handler signature: `async function handler(params: T): Promise<R>`
- All handler inputs validated with `src/main/utils/validate.ts` helpers
- Channel names are defined in `src/shared/ipc-channels.ts`

---

## Native Integrations — `Bun.spawn` Only

No N-API bindings. No node-gyp. No native modules.

| Capability | Binary | Wrapper |
|---|---|---|
| Speech-to-text | `whisper-cli` | `src/main/services/subprocess/WhisperSubprocess.ts` |
| Local LLM | `llama-cli` | `src/main/services/subprocess/LlmSubprocess.ts` |

**Binary resolution order:**
1. `~/.local/share/VoiceVault/bin/` (bundled)
2. `/home/linuxbrew/.linuxbrew/bin/` (Linuxbrew)
3. `$PATH` fallback

**Spawn pattern:**
```typescript
import { resolveBinary, spawnEnv } from '../utils/subprocess'

const proc = Bun.spawn([resolveBinary('whisper-cli'), '--model', modelPath, audioPath], {
  stdout: 'pipe',
  stderr: 'pipe',
  env: spawnEnv(),   // inherits process.env + Linuxbrew PATH prefix
})
const output = await new Response(proc.stdout).text()
await proc.exited
```

---

## Database

`bun:sqlite` in WAL mode at `~/.voicevault/voicevault.db`.

- Migrations: `src/main/services/migrations/*.sql` (numbered, applied in order)
- No ORM — raw prepared statements + transactions
- `electron-store` and `better-sqlite3` have been permanently removed

---

## Renderer Bridge

`src/renderer/src/lib/electrobun-bridge.ts` is the sole cross-process boundary for the renderer.

- Patches `window.api.*` at startup (`src/renderer/src/main.tsx`)
- Every `window.api.domain.method()` call becomes `POST /rpc { channel, params }`
- All 99 existing `window.api.*` channels are covered — renderer code required zero changes

---

## Data Flow — Full Pipeline

```
🎙️ Microphone
  MediaRecorder (browser, in WebView)
        │ audio blob (WAV/WebM)
        ▼
  window.api.audio.saveChunk()
        │ HTTP RPC
        ▼
  rpc/audio.ts  →  writes to ~/.voicevault/recordings/
        │
        ▼ (every ~60s or on Stop)
  rpc/transcription.ts
        │ Bun.spawn whisper-cli
        ▼
  Transcript segments  →  bun:sqlite recordings table
        │
        ├──────────────────────────────────────┐
        │ (on every minute)                    │ (on Stop)
        ▼                                      ▼
  rpc/summarization.ts                 rpc/classification.ts
  Bun.spawn llama-cli                  Bun.spawn llama-cli
  1-min summary → sqlite              zero-shot classify → sqlite
        │
        ▼
  rpc/rag.ts  →  vector embed → local vector index
        │
        ▼ (on RAG Search query)
  embed query → similarity search → ranked results → LLM re-rank
        │
        ▼
  rpc/export.ts  →  Markdown + YAML frontmatter → ~/.voicevault/exports/
```

---

## Packages Permanently Removed

Do not re-introduce these:

| Package | Replaced by |
|---|---|
| `electron` | `electrobun` |
| `electron-vite` | `vite` (direct) |
| `electron-store` | `bun:sqlite`-backed `settings.ts` |
| `better-sqlite3` | `bun:sqlite` |
| `node-llama-cpp` | `Bun.spawn llama-cli` |
| `whisper-cpp-node` | `Bun.spawn whisper-cli` |
| `@electron-toolkit/*` | Electrobun equivalents |
| Python (`FastAPI`, `uvicorn`, `faster-whisper`, etc.) | Removed entirely |
| Docker / Docker Compose | `electrobun package` for distribution |
