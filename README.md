<p align="center">
  <img src="https://img.shields.io/badge/version-0.7.0-blue" alt="version">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license">
  <img src="https://img.shields.io/badge/desktop-Electrobun%201.15-orange" alt="electrobun">
  <img src="https://img.shields.io/badge/runtime-Bun-black" alt="bun">
  <img src="https://img.shields.io/badge/platform-Linux%20%7C%20macOS-lightgrey" alt="platform">
</p>

<h1 align="center">VoiceVault</h1>
<p align="center"><strong>Record your day, let AI organize it.</strong></p>
<p align="center">
An open-source desktop app that transcribes, summarizes, and auto-organizes your recordings
into structured notes — then lets you search across everything with natural language.
Runs entirely on your machine. No cloud. No subscription.
</p>

---

## Why VoiceVault?

You record a lecture, a meeting, a casual conversation — and it all just sits there as audio you'll never revisit.

**VoiceVault changes that.** It transcribes everything with on-device Whisper, then uses AI to:

- Generate concise summaries every minute
- Classify each recording (lecture, meeting, conversation, memo)
- Let you search across all past recordings with natural-language questions
- Export everything as clean, organized Markdown notes for [Obsidian](https://obsidian.md)

All of this runs **locally on your machine** — no cloud, no API keys required (unless you opt in).

---

## Features

### Real-Time Transcription

See your words appear as text while you speak. VoiceVault uses [`whisper-cli`](https://github.com/ggerganov/whisper.cpp) (on-device, via `Bun.spawn` subprocess) — no internet required.

### Smart Summaries

Every minute, an AI summary of what was said appears automatically. Long recordings become clean timelines of key points instead of hours of raw audio.

### Auto-Classification

| What you recorded | What VoiceVault creates |
|---|---|
| A university lecture | A structured **lecture note** |
| A team meeting | A **meeting summary** with action items |
| Coffee with a friend | A **conversation log** |
| Thinking out loud | A **personal memo** |

Classification is fully offline using local LLM via [`llama-cli`](https://github.com/ggerganov/llama.cpp). Custom templates are JSON files in `templates/`.

### RAG Search — Ask Your Past Recordings

Ask a question in plain English (or any language):

> *"What did the professor say about transformer architecture last week?"*

VoiceVault searches across all your recordings and gives you a grounded answer with exact sources and timestamps.

### Obsidian Integration

Export any recording as an Obsidian-compatible Markdown file with YAML frontmatter, auto-generated `[[wikilinks]]` to related recordings, and a clean timeline — ready for your vault.

### Privacy First

- **100% offline** — Whisper and LLM run locally; no data leaves your machine by default
- **No accounts, no sign-ups**
- **Open source** — inspect every line of code

---

## How It Compares

| | VoiceVault | Clova Note | Otter.ai | Built-in Voice Memo |
|---|:---:|:---:|:---:|:---:|
| **Price** | Free | Paid | Paid | Free |
| **Works offline** | ✅ | ✗ | ✗ | ✅ |
| **Auto-summarize** | ✅ | Partial | ✅ | ✗ |
| **Auto-classify** | ✅ | ✗ | ✗ | ✗ |
| **Search past recordings** | Natural language (RAG) | Text only | Text only | ✗ |
| **Custom templates** | ✅ | ✗ | ✗ | ✗ |
| **Obsidian / PKM export** | ✅ | ✗ | ✗ | ✗ |
| **Privacy** | Local-only | Cloud | Cloud | Local |
| **Open source** | ✅ | ✗ | ✗ | ✗ |

---

## Architecture

VoiceVault is a **standalone Electrobun desktop app** — a single binary that ships Bun (runtime) + Zig (launcher) + the system WebView. No Electron. No Python. No Docker.

```
VoiceVault/
├── src/
│   ├── main/                      # Electrobun main process (Bun Worker)
│   │   ├── main.ts                # Entry — DB init, RPC server, BrowserWindow
│   │   ├── http-rpc.ts            # HTTP RPC server (port 50100)
│   │   ├── rpc/                   # Domain handlers: audio, whisper, LLM, export…
│   │   ├── services/
│   │   │   ├── db.ts              # bun:sqlite WAL database
│   │   │   ├── settings.ts        # Settings (bun:sqlite-backed)
│   │   │   ├── registry.ts        # ServiceRegistry singleton
│   │   │   └── subprocess/
│   │   │       ├── WhisperSubprocess.ts   # Bun.spawn whisper-cli
│   │   │       └── LlmSubprocess.ts       # Bun.spawn llama-cli
│   │   └── utils/
│   │       ├── subprocess.ts      # resolveBinary / resolveModel / downloadFile
│   │       └── validate.ts        # assertFiniteId / assertNonEmptyString / …
│   ├── renderer/                  # React 19 + Vite (port 5173)
│   │   └── src/
│   │       ├── lib/
│   │       │   └── electrobun-bridge.ts   # Routes window.api.* → HTTP RPC
│   │       ├── components/        # UI (shadcn/ui + Tailwind CSS v4)
│   │       └── pages/             # Route-level pages
│   └── shared/                    # Types + IPC channel constants
│
├── plugin/                        # Obsidian community plugin (TypeScript + esbuild)
├── scripts/                       # dev-electrobun.sh, test-whisper.sh
├── templates/                     # Classification template JSON files
├── tests/
│   ├── unit/                      # Vitest (renderer components, i18n, format utils)
│   └── e2e/                       # Playwright (app-launch smoke test)
└── electrobun.config.ts
```

### Data Flow

```
Microphone (browser MediaRecorder)
    │ audio blob
    ▼
HTTP RPC  POST /rpc  { channel: "whisper:transcribe-file", params: { filePath } }
    │
    ▼
WhisperSubprocess  →  Bun.spawn whisper-cli
    │ transcript segments
    ▼
LlmSubprocess  →  Bun.spawn llama-cli  (or Claude / OpenAI API)
    │ summary / classification
    ▼
bun:sqlite  (~/.voicevault/voicevault.db)
    │
    ▼
Obsidian Export  →  Markdown + YAML frontmatter
```

---

## Getting Started

### Prerequisites

- **Linux x64 or macOS** (Windows: untested)
- A working **microphone**
- ~2 GB free disk space (AI models)
- **[Bun](https://bun.sh/)** (`~/.bun/bin/bun`)
- **[pnpm](https://pnpm.io/)** (`npm install -g pnpm`)
- **[Linuxbrew](https://brew.sh/)** (Linux) or Homebrew (macOS) — for `whisper-cli` and `llama-cli`

### 1. Clone

```bash
git clone https://github.com/PJH720/VoiceVault.git
cd VoiceVault
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Install on-device AI binaries

```bash
# Whisper (speech-to-text)
brew install whisper-cpp

# llama.cpp (local LLM — for summarization and classification)
brew install llama.cpp
```

Both install as `whisper-cli` and `llama-cli` in your Linuxbrew/Homebrew bin directory.

### 4. Download models

```bash
# Whisper model (~75 MB)
mkdir -p ~/.voicevault/models
wget -O ~/.voicevault/models/ggml-tiny.en.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin

# LLM model (~2 GB — Gemma 3 or similar GGUF)
# Download from HuggingFace and place in ~/.voicevault/models/
```

### 5. Configure environment

```bash
cp .env.example .env
# Edit .env — at minimum no changes needed for fully offline use.
# Add API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY) to enable cloud LLM providers.
```

### 6. Start developing

```bash
pnpm dev
# Starts: Vite renderer (port 5173) + Electrobun launcher
```

---

## Using VoiceVault

### Record

Click the record button — your words appear as text in real time. Every minute, an AI summary is generated automatically.

### Review

Stop recording: VoiceVault classifies the content and presents organized summaries. Browse the timeline and see how your session was categorized.

### Search

Go to **RAG Search** and ask anything:

> **You:** "When is the project deadline?"
>
> **VoiceVault:** "Based on your recording from Feb 8 (conversation with Sarah), the project deadline is next Friday, February 14th. *[Source: rec-2026-02-08, 00:12:30]*"

### Export

Select any recording and export it as an Obsidian Markdown file — metadata, tags, and cross-links included.

---

## Choosing an AI Provider

### Local (Default, Recommended)

Fully offline. No API key needed. Uses `llama-cli` via `Bun.spawn`.

```bash
# Download a GGUF model (e.g. Gemma 3)
# Place in ~/.voicevault/models/ and set LLM_MODEL in .env
```

### Cloud (Claude / OpenAI)

Higher quality summaries. Add keys to `.env`:

```
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=your-key-here
```

Get a Claude API key at [console.anthropic.com](https://console.anthropic.com).

---

## Custom Templates

VoiceVault ships with seven built-in classification templates:

- **Lecture** — key concepts and definitions
- **Meeting** — agenda items, decisions, action items
- **Conversation** — participants, topics, memorable moments
- **Memo** — personal thoughts and ideas
- **Person** — contact notes
- **English Vocabulary** — vocabulary study entries
- **Incident** — incident report documentation

Add your own by dropping a JSON file into `templates/`. See the existing files for the format.

---

## Data & Privacy

| Question | Answer |
|---|---|
| Where is data stored? | `~/.voicevault/` on your machine |
| Does anything go to the cloud? | Only if you opt into Claude / OpenAI API |
| Can I delete my data? | Yes — delete `~/.voicevault/` |
| What format are exports? | Standard Markdown (`.md`) |

---

## Troubleshooting

**No transcription appearing**
- Check that your browser has microphone permission
- Verify `whisper-cli` is installed: `which whisper-cli`
- Run the smoke test: `pnpm test:whisper`

**LLM summaries not working**
- Verify `llama-cli` is installed: `which llama-cli`
- Check that your GGUF model path is correct in `.env`

**App window doesn't open**
- Verify GTK WebKit is installed (Linux): `apt install libwebkit2gtk-4.1-dev`
- Check `scripts/dev-electrobun.sh` for build artifact path

For more, see [wiki/FAQ-&-Troubleshooting.md](./wiki/FAQ-&-Troubleshooting.md) or [open an issue](https://github.com/PJH720/VoiceVault/issues).

---

## For Developers

```bash
pnpm dev             # Vite renderer (5173) + Electrobun launcher
pnpm build           # vite build + bun build → out/
pnpm test            # Vitest unit tests (tests/unit/)
pnpm test:watch      # Vitest watch mode
pnpm test:e2e        # Playwright (tests/e2e/app-launch.test.ts)
pnpm test:whisper    # Whisper HTTP RPC smoke test
pnpm lint            # ESLint + Prettier
pnpm typecheck       # tsc (renderer, tsconfig.web.json)
pnpm typecheck:bun   # tsc (main process, tsconfig.node.json)
pnpm package:linux   # Package for Linux
pnpm package:mac     # Package for macOS
```

**Stack:**
- **Runtime:** [Electrobun](https://github.com/blackboardsh/electrobun) 1.15 (Bun + Zig + system WebView)
- **UI:** React 19 · Vite 6 · Tailwind CSS v4 · shadcn/ui
- **Main process:** Bun Worker · HTTP RPC (port 50100) · `bun:sqlite` WAL
- **Speech-to-Text:** `whisper-cli` via `Bun.spawn`
- **LLM:** `llama-cli` via `Bun.spawn` (local GGUF) or Claude / OpenAI API
- **Testing:** Vitest · Playwright

See [CLAUDE.md](./CLAUDE.md) for contributor guidance and architectural decisions.

---

## Roadmap

- [x] Real-time transcription (Whisper)
- [x] 1-minute auto-summarization
- [x] Zero-shot classification with templates
- [x] RAG search across recordings
- [x] Obsidian Markdown export
- [x] Hourly hierarchical summaries
- [x] Cross-boundary time range extraction
- [x] Electrobun desktop migration (v0.7.0 — Electron fully removed)
- [ ] Obsidian community plugin (embedded UI + RAG search)
- [ ] Speaker diarization (who said what)
- [ ] Mobile companion app

---

## License

MIT License — free for personal and commercial use. See [LICENSE](./LICENSE).

---

<p align="center">
  <strong>VoiceVault</strong> — Record your day, let AI organize it.<br>
  Built with care for <a href="https://www.sogang.ac.kr">Sogang University</a> Runnerthon 2026.
</p>
