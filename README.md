<p align="center">
  <img src="https://img.shields.io/badge/version-0.4.0-blue" alt="version">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license">
  <img src="https://img.shields.io/badge/python-3.12-yellow" alt="python">
  <img src="https://img.shields.io/badge/Next.js-16-black" alt="nextjs">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey" alt="platform">
</p>

<h1 align="center">VoiceVault</h1>
<p align="center"><strong>Record your day, let AI organize it.</strong></p>
<p align="center">
An open-source AI voice recorder that transcribes, summarizes, and auto-organizes your recordings into structured notes — then lets you search across everything with natural language.
</p>

---

## Why VoiceVault?

You record a lecture, a meeting, a casual conversation with friends — and it all just sits there as audio files you'll never listen to again.

**VoiceVault changes that.** It listens in real time, transcribes everything, and uses AI to:

- Automatically generate concise summaries every minute
- Classify each segment (lecture, meeting, conversation, personal memo)
- Let you search across all your recordings with natural-language questions
- Export everything as clean, organized Markdown notes for [Obsidian](https://obsidian.md)

All of this runs **locally on your machine** — no cloud, no subscription, no data leaving your computer.

---

## Features

### Real-Time Transcription

Record and see your words appear as text instantly. VoiceVault uses [faster-whisper](https://github.com/SYSTRAN/faster-whisper) to transcribe audio as you speak — no internet required.

### Smart Summaries

Every minute, VoiceVault generates a short AI summary of what was said. After a long recording, you get a clean timeline of key points instead of hours of raw audio.

### Auto-Classification

Stop organizing manually. VoiceVault uses zero-shot AI classification to automatically detect what kind of content you're recording:

| What you recorded | What VoiceVault creates |
|---|---|
| A university lecture | A structured **lecture note** |
| A team meeting | A **meeting summary** with action items |
| Coffee with a friend | A **conversation log** |
| Thinking out loud | A **personal memo** |

You can create your own custom templates to match your workflow.

### RAG Search — Ask Your Past Recordings

This is where it gets powerful. VoiceVault remembers everything you've ever recorded. Just ask a question in plain English (or any language):

> *"What did the professor say about transformer architecture last week?"*

VoiceVault searches across all your recordings, finds the relevant segments, and gives you a grounded answer with exact sources and timestamps.

### Obsidian Integration

Export any recording as an Obsidian-compatible Markdown file, complete with:

- YAML frontmatter (title, date, category, tags, speakers)
- Auto-generated `[[wikilinks]]` to related recordings
- Clean formatting ready for your knowledge base

### Privacy First

- **100% offline** — runs entirely on your machine
- **No accounts, no sign-ups** — just download and use
- **Your data stays yours** — recordings, transcripts, and notes are stored locally
- **Open source** — inspect every line of code

---

## How It Compares

| | VoiceVault | Clova Note | Otter.ai | Built-in Voice Memo |
|---|:---:|:---:|:---:|:---:|
| **Price** | Free | Paid | Paid | Free |
| **Works offline** | Yes | No | No | Yes |
| **Auto-summarize** | Yes | Partial | Yes | No |
| **Auto-classify** | Yes | No | No | No |
| **Search past recordings** | Natural language (RAG) | Text only | Text only | No |
| **Custom templates** | Yes | No | No | No |
| **Obsidian / PKM export** | Yes | No | No | No |
| **Privacy** | Local-only | Cloud | Cloud | Local |
| **Open source** | Yes | No | No | No |

---

## Architecture

VoiceVault is a monorepo with a Python backend, a Next.js frontend, and an Obsidian plugin:

> **Note:** The Streamlit UI (`src/ui/`) is deprecated. The Next.js frontend is the primary UI.

```
VoiceVault/
├── backend/                   # Python (FastAPI + services)
│   ├── src/
│   │   ├── api/               # REST routes + WebSocket
│   │   ├── core/              # Config, models, exceptions
│   │   └── services/          # Business logic
│   │       ├── audio/         # Recording + preprocessing
│   │       ├── transcription/ # faster-whisper STT
│   │       ├── summarization/ # 1-min / hour / range summaries
│   │       ├── classification/# Zero-shot + template matching
│   │       ├── llm/           # Claude / Ollama providers
│   │       ├── rag/           # ChromaDB + embeddings + retriever
│   │       └── storage/       # SQLite + Obsidian export
│   ├── tests/                 # pytest (unit/integration/e2e/stress)
│   ├── scripts/               # Dev utilities
│   ├── pyproject.toml
│   └── requirements.txt
│
├── frontend/                  # Next.js 16 + TypeScript
│   ├── src/
│   │   ├── app/               # App Router pages (recording, summaries)
│   │   ├── components/        # React components (ui, recording, summaries)
│   │   ├── hooks/             # Custom hooks (WebSocket, audio capture)
│   │   ├── lib/               # API client, utilities
│   │   ├── stores/            # Zustand state management
│   │   └── types/             # TypeScript types (auto-generated from OpenAPI)
│   ├── e2e/                   # Playwright E2E tests
│   ├── package.json
│   └── Dockerfile
│
├── templates/                 # Classification template JSON files
├── docs/                      # OpenAPI spec (openapi.json)
├── docker-compose.yml         # Backend + Frontend + Ollama (optional)
├── Dockerfile                 # Backend Docker image
└── Makefile                   # Unified dev commands
```

### Data Flow

```
Microphone → WebSocket → faster-whisper STT → Real-time Transcript → SQLite
    │                                                 │
    │                                          Every 60s → LLM Summarize
    │                                                 │
    │                                          1-min Summary → SQLite + ChromaDB
    │
    ▼ (Recording Stop)
Collect all summaries → Hour Integration → Zero-shot Classification
    │                                            │
    │                                     Template Matching → Segments
    │                                            │
    ▼                                     Obsidian Markdown Export
RAG Query → Embed → ChromaDB Search → Re-rank → LLM Answer with Citations
```

---

## Getting Started

### Prerequisites

- **macOS, Linux, or Windows** (macOS recommended)
- A working **microphone**
- ~2 GB of free disk space (for AI models)
- **[uv](https://docs.astral.sh/uv/)** (Python package manager)
- **[Node.js 22+](https://nodejs.org/)** and **[pnpm](https://pnpm.io/)**

### Option 1: Quick Setup (Recommended)

1. **Install tooling:**

   ```bash
   # uv (Python)
   curl -LsSf https://astral.sh/uv/install.sh | sh   # or: brew install uv

   # pnpm (Node.js)
   corepack enable && corepack prepare pnpm@latest --activate
   ```

2. **Clone and setup:**

   ```bash
   git clone https://github.com/PJH720/VoiceVault.git
   cd VoiceVault
   cp .env.example .env          # Configure your environment
   make setup                    # Installs backend + frontend deps + Whisper model
   ```

3. **Start developing:**

   ```bash
   make dev   # Starts backend (port 8000) + frontend (port 3000) concurrently
   ```

4. **Open your browser** at **http://localhost:3000** — you're ready to record!

### Option 2: Docker (One Command)

If you have [Docker](https://www.docker.com/products/docker-desktop/) installed:

```bash
git clone https://github.com/PJH720/VoiceVault.git
cd VoiceVault
cp .env.example .env
make up                          # or: docker compose up -d
```

Open **http://localhost:3000** and you're done.

To include Ollama (local LLM) in Docker:

```bash
make up-ollama                   # or: docker compose --profile ollama up -d
```

---

## Using VoiceVault

### 1. Record

Open VoiceVault in your browser and click the record button. Speak naturally — you'll see your words transcribed in real time. Every minute, an AI summary appears automatically.

### 2. Review

When you stop recording, VoiceVault classifies your content and presents organized summaries. Browse the timeline, read key points, and see how your recording was categorized.

### 3. Search

Go to the **RAG Search** tab and type any question. VoiceVault searches through all your past recordings and answers with specific references:

> **You:** "When is the project deadline?"
>
> **VoiceVault:** "Based on your recording from Feb 8 (conversation with Sarah), the project deadline is next Friday, February 14th. *[Source: rec-2026-02-08, 00:12:30]*"

### 4. Export

Select any recording and export it as an Obsidian Markdown file. The exported note includes structured metadata, tags, and links to related recordings — ready to drop into your vault.

---

## Choosing an AI Provider

VoiceVault needs a language model for summarization and classification. You have two options:

### Ollama (Free, Local, Recommended)

Runs entirely on your machine. No API key needed.

```bash
# Install Ollama
brew install ollama    # macOS
# or visit https://ollama.com for other platforms

# Download the model (~2 GB)
ollama pull llama3.2

# Start the server
ollama serve
```

### Claude API (Cloud, Higher Quality)

If you prefer Anthropic's Claude for better summaries, add your API key to the `.env` file:

```
LLM_PROVIDER=claude
CLAUDE_API_KEY=your-key-here
```

Get an API key at [console.anthropic.com](https://console.anthropic.com).

### Security & WebSocket Authentication

By default, VoiceVault runs without authentication for local use. If you're deploying to a remote server or want to add security, enable WebSocket token authentication:

```bash
# Generate a secure token
python -c "import secrets; print(secrets.token_urlsafe(32))"

# Add to .env
WS_AUTH_ENABLED=true
WS_AUTH_TOKEN=your-generated-token-here
```

The WebSocket client will need to include the token in the connection URL:
```
ws://your-server:8000/ws/transcribe?recording_id=123&token=your-token
```

**Note:** Authentication is recommended for any non-localhost deployment to prevent unauthorized access to your recording sessions.

---

## Example: A Day with VoiceVault

Here's what a typical day looks like:

```
09:00  Start recording at a café with a friend
       → VoiceVault: conversation log

10:30  Walk into a lecture hall — keep recording
       → VoiceVault: lecture note (auto-detected!)

12:00  Lunch with another friend
       → VoiceVault: conversation log

13:00  Library study session, talking through ideas
       → VoiceVault: personal memo

18:00  Stop recording
```

**Result:** Four organized documents, each properly classified, summarized, and searchable — from a single continuous recording session.

Later that evening:

> **You:** "What was that concept about agents from today's lecture?"
>
> **VoiceVault:** "In the Advanced AI lecture (10:30–12:00), the professor discussed LangChain Agent design patterns, specifically the ReAct framework for combining reasoning and acting..."

---

## Custom Templates

VoiceVault comes with seven built-in templates:

- **Lecture** — structured notes with key concepts and definitions
- **Meeting** — agenda items, decisions, and action items
- **Conversation** — participants, topics, and memorable moments
- **Memo** — personal thoughts and ideas
- **Person** — contact/person notes
- **English Vocabulary** — vocabulary study entries
- **Incident** — incident report documentation

You can create your own templates to match any recording scenario. Templates are simple JSON files — see the `templates/` folder for examples.

---

## Data & Privacy

| Question | Answer |
|---|---|
| Where is my data stored? | In the `data/` folder on your machine |
| Does anything go to the cloud? | Not unless you choose Claude API as your LLM provider |
| Can I delete my data? | Yes — delete files in `data/` or the whole folder |
| Can I back up my recordings? | Yes — the `data/` folder contains everything |
| What format are exports in? | Standard Markdown (.md) files |

---

## Troubleshooting

**"I can't hear anything / no transcription appears"**
- Check that your browser has microphone permission
- On macOS: System Settings → Privacy & Security → Microphone → allow your browser

**"Summaries are slow or not appearing"**
- If using Ollama, make sure it's running: `ollama serve`
- Check that a model is downloaded: `ollama list`
- The first summary may take 10–15 seconds; subsequent ones are faster

**"I get a connection error"**
- Make sure the backend is running on port 8000: `make dev-backend`
- Check the frontend can reach `http://localhost:8000`

**"Docker won't start"**
- Ensure Docker Desktop is running
- Try `make down` then `make up` again

For more help, check the [FAQ & Troubleshooting](wiki/FAQ-&-Troubleshooting.md) guide or [open an issue](https://github.com/PJH720/VoiceVault/issues).

---

## For Developers

VoiceVault is open source and built with:

- **Backend:** Python 3.12 · FastAPI · WebSocket (real-time audio streaming)
- **Frontend:** Next.js 16 · React 19 · TypeScript · Tailwind CSS · Zustand
- **Speech-to-Text:** faster-whisper (CTranslate2)
- **LLM:** Ollama (local) or Claude API (cloud)
- **Vector Search:** ChromaDB + sentence-transformers
- **Database:** SQLite (async via SQLAlchemy + aiosqlite)
- **Testing:** pytest (backend) · Vitest + Playwright (frontend)
- **CI:** GitHub Actions with path-filtered backend/frontend jobs
- **API Contract:** OpenAPI schema → auto-generated TypeScript types

See the **[wiki/](./wiki/)** for detailed documentation — architecture, API reference, data schema, deployment, and contribution guidelines.

### Make Targets

```bash
# Development
make dev              # Run backend + frontend concurrently
make dev-backend      # Backend only (port 8000)
make dev-frontend     # Frontend only (port 3000)

# Testing
make test             # Run all tests (backend + frontend)
make test-backend     # pytest
make test-frontend    # vitest

# Linting
make lint             # Lint all code
make lint-backend     # ruff check + format check
make lint-frontend    # eslint + prettier + tsc

# Code Generation
make gen-openapi      # Export OpenAPI schema to docs/openapi.json
make gen-types        # Generate TypeScript types from OpenAPI spec

# Docker
make up               # Start backend + frontend
make up-ollama        # Start with Ollama included
make down             # Stop all services
make logs             # Stream logs
make health           # Check service health
make seed             # Seed demo data
make clean            # Stop services + remove volumes

# Setup
make setup            # Full project setup (backend + frontend + models)
```

---

## Roadmap

- [x] Real-time transcription (Whisper)
- [x] 1-minute auto-summarization
- [x] Zero-shot classification with templates
- [x] RAG search across recordings
- [x] Obsidian Markdown export
- [x] Hourly hierarchical summaries
- [x] Cross-boundary time range extraction
- [x] Next.js frontend with TypeScript
- [x] OpenAPI → TypeScript type generation
- [x] Docker Compose orchestration (backend + frontend + Ollama)
- [x] CI pipeline with path-filtered jobs
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
