# Architecture

> Extracted from CLAUDE.md and verified against the source tree.

## Tech Stack

**Electron + React 19 + TypeScript + electron-vite + electron-forge**

- Main process: Node.js + native modules (whisper-cpp-node, node-llama-cpp, native-audio-node, better-sqlite3)
- Renderer process: React 19 + Tailwind CSS v4 + shadcn/ui
- Preload: contextBridge typed API
- Build: electron-vite + @electron-forge/cli

## File Tree

```
VoiceVault/
├── src/
│   ├── main/                          # Electron main process
│   │   ├── index.ts                   # App entry point, BrowserWindow
│   │   ├── ipc/                       # IPC handlers (main ↔ renderer)
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
│   │   ├── services/                  # Native service wrappers
│   │   │   ├── AudioCaptureService.ts
│   │   │   ├── ClassificationService.ts
│   │   │   ├── CloudLLMService.ts
│   │   │   ├── CostEstimator.ts
│   │   │   ├── DatabaseService.ts
│   │   │   ├── DiarizationService.ts
│   │   │   ├── EmbeddingService.ts
│   │   │   ├── ExportService.ts
│   │   │   ├── LLMService.ts
│   │   │   ├── PermissionService.ts
│   │   │   ├── PromptService.ts
│   │   │   ├── RAGService.ts
│   │   │   ├── ServiceRegistry.ts
│   │   │   ├── SpeakerProfileService.ts
│   │   │   ├── SystemAudioService.ts
│   │   │   ├── TemplateEngine.ts
│   │   │   ├── TemplateManager.ts
│   │   │   ├── TranslationService.ts
│   │   │   ├── VectorService.ts
│   │   │   └── WhisperService.ts
│   │   ├── store.ts                   # electron-store (settings)
│   │   └── updater.ts                # electron-updater + Velopack
│   ├── preload/
│   │   └── index.ts                   # Exposes typed API to renderer
│   ├── renderer/
│   │   └── src/
│   │       ├── components/
│   │       │   ├── ui/               # shadcn/ui primitives
│   │       │   ├── Recording/
│   │       │   ├── Library/
│   │       │   ├── Search/
│   │       │   ├── Summary/
│   │       │   ├── Export/
│   │       │   ├── Templates/
│   │       │   ├── Diarization/
│   │       │   ├── Translation/
│   │       │   ├── Settings/
│   │       │   ├── Audio/
│   │       │   ├── Transcript/
│   │       │   └── ErrorBoundary.tsx
│   │       ├── contexts/
│   │       ├── hooks/
│   │       ├── lib/
│   │       ├── i18n/
│   │       └── assets/
│   └── shared/
│       ├── types.ts
│       ├── ipc-channels.ts
│       └── constants.ts
├── resources/
│   ├── templates/
│   └── models/
├── tests/
│   ├── unit/                         # Vitest
│   └── e2e/                          # Playwright
├── electron.vite.config.ts
├── forge.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── pnpm-lock.yaml
```

## Data Flow

```
Microphone / System Audio (native-audio-node / CoreAudio)
        │
        ▼
┌──────────────────────────────┐
│  Audio Capture Service       │  ← PCM audio buffer, VAD filtering
│  (main process)              │
└────────┬─────────────────────┘
         ▼
┌──────────────────────────────┐
│  whisper-cpp-node            │  ← On-device, CoreML on macOS
│  (streaming chunks)          │
└────────┬─────────────────────┘
         ▼
┌──────────────────────────────┐
│  Transcript Segments         │  → better-sqlite3 (persistent)
└────────┬─────────────────────┘
         │
    ┌────┴────────────────┐
    ▼                     ▼
Every 60s            On Stop
    │                     │
    ▼                     ▼
┌──────────────┐  ┌───────────────────┐
│ node-llama-  │  │ Hour Integration  │
│ cpp          │  │ + Classification  │
│ Summarize    │  │                   │
└──────┬───────┘  └───────┬───────────┘
       ▼                  ▼
  SQLite             Obsidian Export
  + Vector DB        (Markdown + wikilinks)
       │
       ▼
  RAG Search → Embed → Vector Search → LLM Answer with Citations
```

## IPC Bridge Architecture

```
┌─────────────────────┐         ┌─────────────────────┐
│   Renderer Process   │  IPC   │    Main Process      │
│   (React + UI)       │◄──────►│   (Node.js + Native) │
│                      │        │                      │
│  useTranscription()  │───────►│  WhisperService      │
│  useRecording()      │───────►│  AudioCaptureService │
│  useSummary()        │───────►│  LLMService          │
│  useSearch()         │───────►│  VectorService       │
│  useDatabase()       │───────►│  DatabaseService     │
└─────────────────────┘         └─────────────────────┘
         ▲
         │ contextBridge
┌────────┴────────────┐
│   Preload Script    │  ← Typed API surface
│   (window.api.*)    │
└─────────────────────┘
```

### IPC Rules

- Never expose Node.js APIs directly to renderer — always go through preload contextBridge
- All channel names defined in `src/shared/ipc-channels.ts`
- Request/response types in `src/shared/types.ts`
- No `ipcRenderer` in renderer — only `window.api.*`
- Validate all IPC inputs in main process handlers
