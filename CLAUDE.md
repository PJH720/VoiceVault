# CLAUDE.md

## Project Overview

VoiceVault is an open-source **cross-platform desktop app** that records, transcribes, summarizes, and auto-organizes voice recordings into structured notes — all on-device, no server required.

**Tech stack:** Electron · React 19 · TypeScript · electron-vite · electron-forge

**Target:** macOS, Linux, Windows (Apple Silicon optimized with CoreML acceleration on macOS)

## Architecture

```
VoiceVault/
├── src/
│   ├── main/                          # Electron main process
│   │   ├── index.ts                   # App entry point, BrowserWindow
│   │   ├── ipc/                       # IPC handlers (main ↔ renderer)
│   │   │   ├── audio.ts              # Audio capture IPC
│   │   │   ├── transcription.ts      # Whisper inference IPC
│   │   │   ├── summarization.ts      # LLM inference IPC
│   │   │   ├── database.ts           # SQLite operations IPC
│   │   │   └── export.ts             # Obsidian/PDF export IPC
│   │   ├── services/                  # Native service wrappers
│   │   │   ├── AudioCaptureService.ts    # native-audio-node (CoreAudio)
│   │   │   ├── WhisperService.ts         # whisper-cpp-node (CoreML)
│   │   │   ├── DiarizationService.ts     # pyannote-cpp-node
│   │   │   ├── LLMService.ts             # node-llama-cpp
│   │   │   ├── DatabaseService.ts        # better-sqlite3
│   │   │   ├── VectorService.ts          # embeddings + vector search
│   │   │   └── ExportService.ts          # Obsidian markdown, PDF
│   │   ├── store.ts                   # electron-store (settings)
│   │   └── updater.ts                # electron-updater + Velopack
│   ├── preload/                       # Preload scripts (context bridge)
│   │   └── index.ts                   # Exposes typed API to renderer
│   ├── renderer/                      # React frontend
│   │   ├── App.tsx                    # Root component, router
│   │   ├── components/                # Reusable UI (shadcn/ui)
│   │   │   ├── ui/                   # shadcn/ui primitives
│   │   │   ├── Recording/            # Recording controls, waveform
│   │   │   ├── Transcript/           # Live transcript, speaker labels
│   │   │   ├── Summary/              # Structured summaries, action items
│   │   │   ├── Search/               # RAG search UI
│   │   │   ├── Library/              # Recording library, filters
│   │   │   └── Settings/             # Preferences, model management
│   │   ├── contexts/                  # React Context providers
│   │   │   ├── RecordingContext.tsx
│   │   │   ├── SettingsContext.tsx
│   │   │   └── I18nContext.tsx
│   │   ├── hooks/                     # Custom React hooks
│   │   ├── lib/                       # Utilities, helpers
│   │   ├── i18n/                      # react-i18next config
│   │   │   ├── ko.json              # Korean
│   │   │   ├── en.json              # English
│   │   │   └── ja.json              # Japanese
│   │   ├── styles/                    # Tailwind CSS v4, globals
│   │   └── index.html
│   └── shared/                        # Types shared across processes
│       ├── types.ts                   # Recording, Transcript, Summary types
│       ├── ipc-channels.ts           # IPC channel name constants
│       └── constants.ts              # App-wide constants
├── resources/                         # Static assets, default templates
│   ├── templates/                    # Classification templates (JSON)
│   └── models/                       # Model download manifests
├── tests/
│   ├── unit/                         # Vitest unit tests
│   └── e2e/                          # Playwright E2E tests
├── electron.vite.config.ts
├── forge.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── pnpm-lock.yaml
```

### Data Flow

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

### IPC Bridge Architecture

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

## Build & Run

### Prerequisites
- **Node.js** 20+ (LTS recommended)
- **pnpm** 9+
- ~5 GB free disk space (for AI models)
- macOS 13+ / Linux / Windows 10+

### Quick Start
```bash
git clone https://github.com/PJH720/VoiceVault.git
cd VoiceVault
pnpm install
pnpm dev
```

### First Launch
On first launch, VoiceVault will download the required Whisper model (~150 MB for `base`, ~1.5 GB for `large-v3-turbo`). Models are cached in the app's user data directory.

### Scripts
| Command | Description |
|---------|-------------|
| `pnpm dev` | Start in development mode with hot reload |
| `pnpm build` | Build for production |
| `pnpm package` | Package the app (unsigned) |
| `pnpm make` | Package + create distributable (DMG/deb/exe) |
| `pnpm lint` | ESLint + TypeScript check |
| `pnpm test` | Run Vitest unit tests |
| `pnpm test:e2e` | Run Playwright E2E tests |

### Build Configurations
| Config | Use |
|--------|-----|
| **Development** | Hot reload, DevTools open, verbose logging |
| **Production** | Minified, tree-shaken, no DevTools |

### Signing & Distribution
- **macOS:** Code signing + notarization via electron-forge (requires Developer ID)
- **Windows:** Code signing via electron-forge (optional)
- **Linux:** AppImage, deb, rpm via electron-forge

## Testing

```bash
# Unit tests
pnpm test

# Unit tests in watch mode
pnpm test:watch

# E2E tests
pnpm test:e2e

# Coverage
pnpm test:coverage
```

### Test Structure
| Target | Framework | Scope |
|--------|-----------|-------|
| `tests/unit/` | Vitest | Unit tests — services, utilities, hooks |
| `tests/e2e/` | Playwright | E2E tests — full app flows |

### Test Conventions
- Test files mirror source structure: `src/main/services/WhisperService.ts` → `tests/unit/services/WhisperService.test.ts`
- Use `vi.mock()` for native module mocking (whisper-cpp-node, etc.)
- React component tests use `@testing-library/react`
- E2E tests use Playwright's Electron support (`_electron.launch()`)

## Code Style & Conventions

### TypeScript
- **Strict mode** — `"strict": true` in tsconfig, no exceptions
- **No `any`** — use `unknown` and narrow, or define proper types
- **Explicit return types** on exported functions
- **Path aliases** — `@main/`, `@renderer/`, `@preload/`, `@shared/`
- Line length: soft 100 chars
- Semicolons: yes
- Quotes: single

### React
- **Functional components** only — no class components
- **React Context** for state management (no Redux/Zustand)
- **Custom hooks** for logic extraction (`useTranscription`, `useRecording`, etc.)
- **shadcn/ui** for UI primitives — don't reinvent buttons, dialogs, etc.
- **Tailwind CSS v4** for styling — no CSS modules, no styled-components

### IPC Rules (Critical)
- **Never expose Node.js APIs directly to renderer** — always go through preload contextBridge
- **Typed IPC channels** — all channel names defined in `src/shared/ipc-channels.ts`
- **Typed payloads** — request/response types in `src/shared/types.ts`
- **No `ipcRenderer` in renderer** — only use `window.api.*` exposed by preload
- **Validate all IPC inputs** in main process handlers

### i18n
- **All user-facing strings** must use `react-i18next` `t()` function
- **No hardcoded strings** in components
- **Korean (`ko`)** is the primary locale, English (`en`) and Japanese (`ja`) supported
- Translation keys: `namespace.section.key` format (e.g., `recording.controls.start`)

### Naming
- Components: `PascalCase` (e.g., `TranscriptView.tsx`, `RecordingControls.tsx`)
- Hooks: `camelCase` with `use` prefix (e.g., `useTranscription.ts`)
- Services: `PascalCase` with `Service` suffix (e.g., `WhisperService.ts`)
- IPC channels: `kebab-case` (e.g., `audio:start-capture`, `whisper:transcribe`)
- Types/interfaces: `PascalCase` (e.g., `TranscriptSegment`, `RecordingSummary`)

### Dependencies

| Dependency | Purpose | Process |
|------------|---------|---------|
| **electron** (v40+) | Desktop app shell | Main |
| **react** (v19) | UI framework | Renderer |
| **typescript** (v5+) | Type safety | All |
| **electron-vite** | Build tooling (Vite-based) | Build |
| **@electron-forge/cli** | Packaging & distribution | Build |
| **whisper-cpp-node** | Whisper inference (CoreML on macOS) | Main |
| **pyannote-cpp-node** | Speaker diarization (pyannote-ggml) | Main |
| **node-llama-cpp** | Local LLM inference (GGUF models) | Main |
| **native-audio-node** | CoreAudio capture (mic + system audio) | Main |
| **better-sqlite3** | Local SQLite database | Main |
| **electron-store** | Settings/preferences persistence | Main |
| **tailwindcss** (v4) | Utility-first CSS | Renderer |
| **@radix-ui/*** | Accessible UI primitives (via shadcn/ui) | Renderer |
| **react-i18next** | Internationalization | Renderer |
| **pdf-parse** + **react-pdf** | PDF document ingestion & viewing | Main + Renderer |
| **electron-updater** | Auto-update (Velopack) | Main |
| **vitest** | Unit testing | Test |
| **@playwright/test** | E2E testing | Test |

---

## Roadmap & Goals

Based on competitive analysis of [Alt](https://altalt.io) (KAIST team, Electron-based) and the broader AI note-taking landscape.

### Phase 1 — Core App: Shell + Recording + Transcription 🎙️ (Foundation)

**Goal:** Ship a working cross-platform app that records audio and transcribes on-device via Whisper.

**Deliverables:**
- Electron + React + TypeScript app shell (system tray + main window)
- `native-audio-node` microphone capture with VAD (Voice Activity Detection)
- `whisper-cpp-node` integration with CoreML acceleration (macOS) / CPU fallback (Linux/Windows)
- Real-time transcript display as segments arrive (IPC streaming)
- `better-sqlite3` persistence: recordings, transcript segments
- Recording library view (list, search, delete)
- Audio playback with transcript sync (tap segment → seek)
- Model management: download/select Whisper model size in Settings
- Basic export: copy transcript as plain text
- i18n scaffolding (ko, en, ja)

### Phase 2 — LLM Summarization 🧠 (Intelligence)

**Goal:** Add on-device LLM summarization with structured output.

**Deliverables:**
- `node-llama-cpp` integration for local GGUF model inference (Llama 3.2 3B, gemma-3n, etc.)
- 1-minute auto-summarization during recording
- Structured summary output:
  ```json
  {
    "summary": "...",
    "action_items": [{"task": "...", "assignee": "...", "deadline": "..."}],
    "discussion_points": ["..."],
    "key_statements": [{"speaker": "...", "text": "...", "timestamp": "..."}],
    "decisions": ["..."]
  }
  ```
- Hour-level integration summaries on recording stop
- Optional Claude API fallback for higher-quality summaries
- Model management: download/select LLM in Settings
- Summary view: action items, discussion points, decisions as separate sections

### Phase 3 — Speaker Diarization 🎭 (Who Said What)

**Goal:** Identify and label speakers in recordings.

**Integration target:** `pyannote-cpp-node` — Node bindings for pyannote-ggml, 39x faster than real-time.

**Deliverables:**
- `pyannote-cpp-node` wrapper (segmentation + embedding + clustering)
- Post-transcription diarization: align speaker labels with transcript segments
- Speaker-colored transcript view
- Speaker occupancy stats (% talk time per speaker)
- Per-speaker key statement extraction via LLM
- Speaker profile management: name/tag speakers, persist across recordings
- Speaker timeline visualization

### Phase 4 — RAG Search 🔍 (Memory)

**Goal:** Search across all recordings with natural language, get grounded answers with citations.

**Deliverables:**
- Local vector database (sqlite-vss or custom HNSW index)
- Sentence embeddings via local model (MiniLM ONNX or similar)
- Automatic embedding of transcript segments and summaries
- Natural-language query → vector search → re-rank → LLM answer with citations
- Citation format: recording name, timestamp, speaker (if available)
- Search view with query history and results
- PDF/document ingestion into the same RAG pipeline (`pdf-parse`)

### Phase 5 — Obsidian Export + Classification 📝 (Organization)

**Goal:** Auto-classify recordings and export as Obsidian-ready Markdown.

**Deliverables:**
- Zero-shot classification via LLM (lecture, meeting, conversation, memo, etc.)
- 7 built-in templates + custom template support (JSON files in `resources/templates/`)
- Obsidian Markdown export:
  - YAML frontmatter (title, date, category, tags, speakers)
  - Auto-generated `[[wikilinks]]` to related recordings
  - Structured sections per template type
- Export settings: choose vault location, configure frontmatter fields
- Batch export for multiple recordings
- Template editor in Settings

### Phase 6 — System Audio Capture 🔊 (Meetings)

**Goal:** Capture audio from Zoom, Google Meet, Microsoft Teams, and other apps.

**Deliverables:**
- `native-audio-node` system audio capture via CoreAudio (macOS)
- Platform-specific fallbacks: PulseAudio (Linux), WASAPI (Windows)
- Audio source selector: microphone only / system audio only / both
- App picker: select which app's audio to capture
- Meeting platform auto-detection (detect Zoom/Meet/Teams process)
- Separate mic + system audio tracks for better diarization
- Setup guide for first-time configuration

### Phase 7 — Real-Time Translation 🌐 (Global)

**Goal:** Live translation of transcripts into other languages.

**Deliverables:**
- On-device translation via local NLLB model (node-llama-cpp or dedicated translation model)
- Dual-language transcript display (original + translated)
- Language auto-detection per segment
- 100+ language support
- Translation memory/cache for repeated phrases
- Full i18n: Korean, English, Japanese UI

---

## Competitive Positioning vs Alt

| Capability | Alt | VoiceVault (v0.5.0) | VoiceVault (Planned) |
|---|---|---|---|
| Desktop app (Electron) | ✅ macOS only | ✅ Phase 1 | ✅ macOS + Linux + Windows |
| On-device Whisper | ✅ whisper-cpp-node + CoreML | ✅ Phase 1 | ✅ |
| Speaker diarization | ✅ pyannote-cpp-node | ❌ | Phase 3 (same engine) |
| Structured meeting minutes | ✅ Action items, speaker stats | ❌ | Phase 2 |
| Real-time translation | ✅ 100+ languages | ❌ | Phase 7 |
| System audio capture | ✅ native-audio-node | ❌ | Phase 6 (same engine) |
| PDF/document ingestion | ✅ | ❌ | Phase 4 |
| Local LLM | ✅ node-llama-cpp (gemma-3n) | ❌ | Phase 2 (node-llama-cpp) |
| **Cross-platform** | ❌ macOS only | ✅ Phase 1 | ✅ macOS + Linux + Windows |
| **Obsidian integration** | ❌ | ❌ | Phase 5 (wikilinks + frontmatter) |
| **Custom templates** | ❌ | ❌ | Phase 5 (7 built-in + custom) |
| **RAG search with citations** | Partial (AI chat) | ❌ | Phase 4 (full RAG pipeline) |
| **Open source (full app)** | ❌ Closed source (engine libs OSS) | ✅ | ✅ MIT top to bottom |

### VoiceVault's Moat

1. **Cross-platform from day one** — Alt is macOS-only (Windows "coming soon"). VoiceVault runs on macOS, Linux, and Windows via Electron
2. **Obsidian-native** — No other voice app does wikilinks, frontmatter, and vault integration
3. **Fully open source** — Alt's app is closed source; only their native engine libraries are OSS. VoiceVault is MIT-licensed, top to bottom
4. **Template system** — Customizable classification templates, not one-size-fits-all meeting notes
5. **RAG with citations** — Proper retrieval-augmented generation with source timestamps, not just keyword search
6. **Privacy by architecture** — No server, no accounts, no telemetry. SQLite on disk, models local, nothing leaves your computer
7. **Extensible** — Open architecture means community can add export targets, templates, and model backends

### Integration Targets (Open Source)

| Repository | What It Provides | Integration |
|---|---|---|
| [whisper.cpp](https://github.com/ggerganov/whisper.cpp) | CoreML-accelerated Whisper inference | via whisper-cpp-node |
| [pyannote-ggml](https://github.com/nicktolhurst/pyannote-ggml) | Speaker diarization (segmentation + embedding + clustering) | via pyannote-cpp-node |
| [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) | Local LLM inference (GGUF models) | Direct npm dependency |
| [native-audio-node](https://github.com/nicktolhurst/coreaudio-node) | CoreAudio capture (mic + system audio) | Direct npm dependency |
