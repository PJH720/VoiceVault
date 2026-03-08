# Getting Started

Install VoiceVault from source, configure AI models, and make your first recording.

> **Platform:** Linux x64 (primary), macOS (supported). Windows: untested.

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| **Bun** | 1.x | `curl -fsSL https://bun.sh/install \| bash` |
| **pnpm** | 10.x | `npm install -g pnpm` |
| **Linuxbrew** (Linux) | latest | [brew.sh](https://brew.sh) |
| **Homebrew** (macOS) | latest | [brew.sh](https://brew.sh) |
| **GTK + WebKitGTK** (Linux) | 4.x | `sudo apt install libgtk-4-dev libwebkit2gtk-4.1-dev` |

**Hardware:**
- 4 GB RAM minimum (8 GB+ recommended for local LLM)
- ~2 GB free disk space for AI models
- Working microphone

---

## 1. Clone the Repo

```bash
git clone https://github.com/PJH720/VoiceVault.git
cd VoiceVault
```

---

## 2. Install Dependencies

```bash
pnpm install
```

This installs all JavaScript/TypeScript dependencies including Electrobun, React 19, Vite, and Vitest.

There is no Python dependency installation step — VoiceVault has no Python code.

---

## 3. Install AI Binaries

VoiceVault uses [`whisper-cli`](https://github.com/ggerganov/whisper.cpp) for transcription
and [`llama-cli`](https://github.com/ggerganov/llama.cpp) for local LLM summarization.
Both are invoked as subprocesses via `Bun.spawn` — no native bindings, no N-API.

```bash
# Linux (Linuxbrew)
brew install whisper-cpp llama.cpp

# macOS (Homebrew)
brew install whisper-cpp llama.cpp
```

Verify:
```bash
which whisper-cli    # → /home/linuxbrew/.linuxbrew/bin/whisper-cli
which llama-cli      # → /home/linuxbrew/.linuxbrew/bin/llama-cli
```

> Both commands compile from source — allow 5–10 minutes.

---

## 4. Download Models

```bash
# Create model directory
mkdir -p ~/.voicevault/models

# Whisper tiny.en (~75 MB — fast, good for English)
wget -O ~/.voicevault/models/ggml-tiny.en.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin

# Whisper base.en (~142 MB — better accuracy)
# wget -O ~/.voicevault/models/ggml-base.en.bin \
#   https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
```

### Whisper Model Comparison

| Model | Size | Accuracy | Recommended for |
|---|---|---|---|
| `tiny.en` | 75 MB | Good | Fast machines, quick testing |
| `base.en` | 142 MB | Better | Daily use |
| `small.en` | 466 MB | Great | High-quality transcription |
| `medium.en` | 1.5 GB | Excellent | Best local quality |

### LLM Model (for local summarization)

Download a GGUF-format model from HuggingFace and place it in `~/.voicevault/models/`:

```bash
# Example: Gemma 3 (~2 GB)
# Download from: https://huggingface.co/google/gemma-2-2b-it-GGUF
# Filename: gemma-2-3n-instruct-q4_k_m.gguf
cp ~/Downloads/gemma-2-3n-instruct-q4_k_m.gguf ~/.voicevault/models/
```

---

## 5. Configure Environment

```bash
cp .env.example .env
```

Minimal `.env` for fully offline use:

```env
# Whisper model (filename in ~/.voicevault/models/)
WHISPER_MODEL=ggml-tiny.en.bin

# LLM model (filename in ~/.voicevault/models/)
LLM_MODEL=gemma-2-3n-instruct-q4_k_m.gguf

# Optional: cloud LLM fallback (leave blank for local-only)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

---

## 6. Start the App

```bash
pnpm dev
```

This runs two processes concurrently:
1. **Vite** — serves the React renderer at `http://localhost:5173`
2. **Electrobun launcher** — starts the GTK window + Bun Worker (HTTP RPC on port 50100)

The window should open automatically. If not, see [FAQ & Troubleshooting](FAQ-&-Troubleshooting).

---

## 7. Verify the Setup

Run the Whisper smoke test to confirm the subprocess pipeline is working:

```bash
pnpm test:whisper
```

Expected output: a transcript of the bundled test audio clip, returned via HTTP RPC.

Run the unit test suite:

```bash
pnpm test
```

Expected: 6/6 files, 9/9 tests passing.

---

## Your First Recording

1. The VoiceVault window opens to the **Home** dashboard
2. Navigate to **Recording** and click **Start Recording**
3. Allow microphone access when the browser permission prompt appears
4. Speak naturally — you'll see transcription appear in real time
5. After ~1 minute, a first summary is generated automatically
6. Click **Stop Recording** to finalize
7. Your recording is classified, summarized, and saved to `~/.voicevault/voicevault.db`

---

## Next Steps

- [User Guide](User-Guide) — all features in detail
- [Template System](Template-System) — create custom classification templates
- [Architecture](Architecture) — understand the Electrobun process model
- [Development Guide](Development-Guide) — set up for contribution
