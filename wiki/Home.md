# VoiceVault Wiki

> **Record your day, let AI organize it.**

---

## What is VoiceVault?

VoiceVault is an open-source **desktop application** that transcribes, summarizes, and auto-organizes your voice recordings into structured notes — then lets you search across everything with natural language. It runs entirely on your machine, with no cloud dependency and no subscription required.

### The Paradigm Shift (v0.7.0)

VoiceVault was originally prototyped as a Python/FastAPI + Next.js web application. **That architecture has been entirely retired.**

As of v0.7.0, VoiceVault is a **pure Electrobun desktop app**:

| Before (≤ v0.6.0) | After (v0.7.0+) |
|---|---|
| Python 3.12 + FastAPI backend | No Python — Bun runtime only |
| Next.js 16 frontend (web) | React 19 + Vite renderer (desktop WebView) |
| Docker Compose orchestration | Single binary — `electrobun package` |
| Electron 39 desktop shell | Electrobun 1.15 (Bun + Zig + system WebView) |
| `better-sqlite3` (N-API) | `bun:sqlite` (built-in, zero native bindings) |
| `node-llama-cpp` (N-API) | `Bun.spawn llama-cli` subprocess |
| `whisper-cpp-node` (N-API) | `Bun.spawn whisper-cli` subprocess |

This is not a migration with a compatibility shim — **all Python code, Docker files, and legacy frontend files have been permanently deleted**.

### Core Values

| Principle | What it means |
|---|---|
| **Local-First** | All data stored on your machine. App fully functional with no internet |
| **Privacy by Design** | Zero telemetry. No accounts. Your recordings never leave your computer |
| **Bun-Native** | Built on Bun — fast startup, `bun:sqlite`, `Bun.spawn` for subprocesses |
| **Provider-Agnostic** | Use local `llama-cli` models or plug in Claude / OpenAI API keys |
| **Open Source** | MIT license — fork it, inspect it, ship it |

---

## Data Flow

```
🎙️ Microphone (browser MediaRecorder)
        │ audio blob
        ▼
HTTP RPC — POST /rpc { channel, params }
        │
        ▼
WhisperSubprocess  →  Bun.spawn whisper-cli
        │ transcript segments
        ▼
LlmSubprocess  →  Bun.spawn llama-cli (or Claude / OpenAI API)
        │ summary / classification
        ▼
bun:sqlite  (~/.voicevault/voicevault.db)
        │
        ▼
📄 Obsidian Export — Markdown + YAML frontmatter + [[wikilinks]]
```

---

## Tech Stack

| Layer | Technology | Role |
|---|---|---|
| **Desktop runtime** | [Electrobun](https://github.com/blackboardsh/electrobun) 1.15 | Bun + Zig launcher + system WebView |
| **Main process** | Bun Worker (TypeScript) | HTTP RPC server, services, subprocesses |
| **Renderer** | React 19 + Vite 6 + Tailwind CSS v4 + shadcn/ui | Desktop UI |
| **Database** | `bun:sqlite` (WAL mode) | Local persistent store |
| **Speech-to-Text** | `whisper-cli` via `Bun.spawn` | On-device transcription |
| **LLM** | `llama-cli` via `Bun.spawn` | Local summarization & classification |
| **Cloud LLM (opt-in)** | Anthropic Claude / OpenAI | Higher-quality summaries |
| **Testing** | Vitest + Playwright | Unit + E2E |

---

## Quick Navigation

### Getting Started
- **[Getting Started](Getting-Started)** — Install, configure, and record
- **[User Guide](User-Guide)** — Feature-by-feature walkthrough
- **[FAQ & Troubleshooting](FAQ-&-Troubleshooting)** — Common issues

### Technical Docs
- **[Architecture](Architecture)** — Electrobun process model, HTTP RPC, data flow
- **[API Reference](API-Reference)** — HTTP RPC channel reference
- **[Template System](Template-System)** — Custom classification templates
- **[Data Schema & Pipeline](Data-Schema-&-Pipeline)** — SQLite schema, migration system

### Development & Shipping
- **[Development Guide](Development-Guide)** — Dev environment, conventions, workflow
- **[Deployment](Deployment)** — Packaging and distributing the app
- **[Roadmap](Roadmap)** — Milestones and planned features

---

## Project Context

Built for the **Sogang University Runnerthon 2026** hackathon.

- **License:** MIT
- **Repository:** [github.com/PJH720/VoiceVault](https://github.com/PJH720/VoiceVault)
- **Current version:** v0.7.0
