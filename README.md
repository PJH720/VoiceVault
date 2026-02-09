# VoiceVault

> "Record your day, let AI organize it"

AI-powered voice recording system with automatic transcription, summarization, and classification. Built for 서강대학교 러너톤 2026.

## Features

- 🎙️ **Real-time Transcription** - Whisper-powered speech-to-text
- 📝 **Smart Summaries** - AI-generated summaries (1-min, hourly, session-level)
- 🏷️ **Auto-Classification** - Zero-shot classification into lectures, meetings, conversations
- 🔒 **Local-First** - 100% offline with Ollama + local Whisper
- 🔄 **Provider-Agnostic** - Switch between Claude API ↔ Ollama via config
- 📦 **Export Ready** - Generate structured Markdown notes

## Quick Start

### Prerequisites

- [uv](https://docs.astral.sh/uv/) (Python 3.12 is auto-managed by uv)
- Docker + docker-compose (optional, for containerized setup)

### Local Development Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd VoiceVault

# Run automated setup script (installs uv, creates venv, installs deps)
bash scripts/setup_dev.sh

# Or manual setup:
uv venv --python 3.12
source .venv/bin/activate
uv pip install -r requirements.txt
uv pip install -e ".[dev]"

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start backend server
uvicorn src.api.app:app --reload --port 8000

# Start frontend (in another terminal)
streamlit run src/ui/app.py
```

### Docker Setup

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

Access the application:
- **API:** http://localhost:8000
- **UI:** http://localhost:8501
- **Ollama:** http://localhost:11434

## Project Structure

```
├── src/
│   ├── core/              # Configuration, models, utilities
│   ├── services/          # Business logic (LLM, STT, summarization)
│   ├── api/               # FastAPI backend
│   └── ui/                # Streamlit frontend
├── tests/                 # pytest tests
├── scripts/               # Development utilities
├── templates/             # Classification templates
├── data/                  # Runtime data (recordings, exports, DB)
├── docker-compose.yml     # Multi-service orchestration
├── Dockerfile             # Container image
└── pyproject.toml         # Python dependencies
```

## Development

### Commands

```bash
# Run tests
pytest

# Lint and format
ruff check src/ tests/
ruff format src/ tests/

# Type checking
mypy src/ --ignore-missing-imports

# Download Whisper models
python scripts/download_models.py --model base
```

### Architecture

- **Backend:** FastAPI with WebSocket for real-time audio streaming
- **Frontend:** Streamlit multi-page application
- **Database:** SQLite with async SQLAlchemy
- **STT:** faster-whisper (CTranslate2)
- **LLM:** Ollama (local) or Claude API (optional)

See [CLAUDE.md](./CLAUDE.md) for detailed development guidelines.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Python 3.12 (managed by uv) |
| Backend | FastAPI + WebSocket |
| Frontend | Streamlit |
| STT | faster-whisper |
| LLM | Ollama / Claude API |
| Database | SQLite + SQLAlchemy (async) |
| Audio | sounddevice + pydub |
| Testing | pytest + pytest-asyncio |

## Environment Variables

Key configuration in `.env`:

```bash
# LLM Provider
LLM_PROVIDER=ollama              # "ollama" or "claude"
OLLAMA_MODEL=llama3.2
CLAUDE_API_KEY=sk-ant-...        # Optional

# Whisper
WHISPER_MODEL=base               # tiny, base, small, medium, large-v3
WHISPER_DEVICE=cpu               # cpu or cuda

# Database
DATABASE_URL=sqlite+aiosqlite:///./data/voicevault.db
```

See `.env.example` for full configuration options.

## Contributing

This is a hackathon project for educational purposes. Contributions are welcome!

### Development Workflow

1. Create a feature branch
2. Make your changes
3. Run tests and linting
4. Submit a pull request

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Acknowledgments

- 서강대학교 러너톤 2026
- OpenAI Whisper / faster-whisper
- Anthropic Claude / Ollama

---

**Status:** v0.1.0 - Initial Setup Complete ✅

For detailed architecture and development guidelines, see [CLAUDE.md](./CLAUDE.md)
