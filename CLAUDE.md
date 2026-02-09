# CLAUDE.md - VoiceVault Project Guide

## Project Overview

VoiceVault is an open-source AI voice recorder that transcribes, summarizes,
auto-classifies recordings into structured notes, and uses RAG to connect
knowledge across your entire vault.

**Context**: 서강대학교 러너톤 2026 해커톤 (2-week MVP)
**Stack**: Python 3.12 (uv) | FastAPI | Streamlit | Whisper | Claude/Ollama | SQLite | ChromaDB
**Tagline**: "Record your day, let AI organize it"
**Deployment Targets**: Standalone web app (MVP) → Obsidian plugin (v1.0)

### Core Value Proposition

- **All-day continuous recording** → AI auto-classifies & organizes
- Record a lecture → get a "lecture note"; record with friends → get a "conversation log"
- User-defined templates control how each segment is classified and formatted
- **RAG-powered search**: Query past recordings with natural language, get grounded answers with citations
- **Obsidian integration**: Export as Obsidian-compatible Markdown with frontmatter, wikilinks, and tags
- Local-first architecture: 100% offline with Ollama + local Whisper + local embeddings
- Provider-agnostic: Claude API ↔ Ollama switchable via `.env`

### Key Differentiators vs Clova Note / Tiro

| Feature | Clova Note | VoiceVault |
|---------|-----------|------------|
| Pricing | Paid subscription | Free (open-source, MIT) |
| Privacy | Cloud-only | Local-first (GDPR/HIPAA ready) |
| Offline | No | Yes (Ollama + Whisper local) |
| Classification | None | Zero-shot auto-classification with user templates |
| Cross-boundary | No | Select any time range across hour boundaries |
| API Freedom | Locked | User chooses provider (Claude/Ollama/OpenAI) |
| **RAG Search** | No | Search past recordings with natural language |
| **PKM Integration** | No | Obsidian plugin with wikilinks + frontmatter |

---

## Repository Structure

```
src/
├── core/              # Config, models, events, exceptions
│   ├── config.py      # Pydantic Settings (.env loader)
│   ├── models.py      # Pydantic data models (request/response)
│   ├── events.py      # Internal async event bus
│   └── exceptions.py  # VoiceVaultError hierarchy
│
├── services/          # Business logic (the heart of the app)
│   ├── audio/         # Audio recording, PCM→WAV, chunk splitting
│   │   ├── recorder.py    # WebSocket audio receiver
│   │   └── processor.py   # Preprocessing (16kHz, mono, chunk split)
│   ├── transcription/ # STT with Whisper
│   │   ├── base.py        # BaseSTT interface (ABC)
│   │   └── whisper_stt.py # Whisper implementation
│   ├── summarization/ # 1-min / 1-hour / session summaries
│   │   ├── base.py        # BaseSummarizer interface (ABC)
│   │   └── minute_summarizer.py  # 1-min auto-summary
│   ├── classification/ # Zero-shot classification + template matching
│   │   ├── classifier.py       # Claude/Ollama zero-shot
│   │   └── template_matcher.py # Match segments to user templates
│   ├── llm/           # LLM provider abstraction
│   │   ├── base.py        # BaseLLM interface (ABC)
│   │   ├── claude_llm.py  # Claude API (anthropic package)
│   │   └── ollama_llm.py  # Ollama local (localhost:11434)
│   ├── rag/           # RAG (Retrieval-Augmented Generation)
│   │   ├── base.py        # BaseEmbedding / BaseVectorStore interfaces (ABC)
│   │   ├── embeddings.py  # Sentence-transformer / Ollama embeddings
│   │   ├── vectorstore.py # ChromaDB vector store wrapper
│   │   └── retriever.py   # RAG query pipeline (embed → search → rerank → answer)
│   └── storage/       # Data persistence
│       ├── database.py    # SQLAlchemy async engine (aiosqlite)
│       ├── models_db.py   # ORM table models
│       ├── repository.py  # CRUD operations
│       └── export.py      # Markdown file generation (Obsidian-compatible)
│
├── api/               # FastAPI (thin wrapper over services)
│   ├── app.py         # App factory + CORS + router registration
│   ├── websocket.py   # /ws/transcribe real-time endpoint
│   ├── routes/        # REST endpoints
│   │   ├── recording.py       # POST/GET recordings
│   │   └── summary.py        # GET summaries
│   └── middleware/
│       └── error_handler.py   # Global exception → JSON response
│
└── ui/                # Streamlit frontend
    ├── app.py         # Main multipage app
    ├── pages/         # 01_recording, 02_summaries, ...
    └── components/    # Reusable UI widgets

obsidian-plugin/       # Obsidian plugin (TypeScript, future v1.0)
│   ├── manifest.json  # Plugin metadata
│   ├── main.ts        # Plugin entry point
│   ├── settings.ts    # Settings tab (API keys, templates)
│   └── src/           # Plugin source (UI panels, service wrappers)

templates/             # Default classification templates (JSON)
tests/                 # pytest (unit + integration + fixtures)
scripts/               # Dev utilities (setup, model download, seed)
data/                  # Runtime data (gitignored): recordings/, exports/, chroma_db/, DB
```

---

## Key Commands

```bash
# ── Development ──
uvicorn src.api.app:app --reload --port 8000       # Backend server
streamlit run src/ui/app.py                         # Frontend UI

# ── Testing ──
pytest tests/ -v                                     # All tests
pytest tests/unit/ -v                                # Unit only
pytest tests/integration/ -v                         # Integration only
pytest tests/ -v --cov=src --cov-report=html        # Coverage report

# ── Linting & Formatting ──
ruff check src/ tests/                               # Lint check
ruff check src/ tests/ --fix                         # Auto-fix
ruff format src/ tests/                              # Format code
mypy src/ --ignore-missing-imports                   # Type check

# ── Docker ──
docker-compose up -d                                 # Full stack
docker-compose logs -f                               # Stream logs

# ── Setup (uv 필수) ──
uv venv --python 3.12                                # Virtual env (Python 자동 다운로드)
source .venv/bin/activate                            # Activate
uv pip install -r requirements.txt                   # Install deps
uv pip install -e ".[dev]"                           # Install dev deps
cp .env.example .env                                 # Config file
python scripts/download_models.py                    # Whisper model
python scripts/seed_templates.py                     # Default templates
```

---

## Architecture Decisions

### Data Flow — Full Pipeline

```
[Phase 1: Real-time]              [Phase 2: Post-processing]         [Phase 3: RAG & Export]

 Microphone → Audio (PCM)          Recording Stop                     User Query (natural lang)
       ↓                               ↓                                   ↓
 WebSocket → FastAPI               Collect all 1-min summaries        Embed query → ChromaDB
       ↓                               ↓                                   ↓
 Whisper STT (base model)          Hour Integration (계층적 압축)      Similarity search (Top-K)
       ↓                           60 summaries → 1 hour doc               ↓
 Real-time Transcript → SQLite         ↓                              Re-rank + metadata filter
       ↓                           Zero-shot Classification                ↓
 Every 60s → LLM Summarize        (Claude/Ollama + user templates)    LLM answer with citations
       ↓                               ↓                                   ↓
 1-min Summary → SQLite            Template Matching → Segments       Grounded response + sources
       ↓                               ↓                                   ↓
 Embed summary → ChromaDB         Obsidian Markdown Export            UI: RAG search panel
       ↓                          (frontmatter + wikilinks)
 UI Live Update
```

### Provider Pattern (Interface Abstraction)

All LLM/STT/RAG services implement base interfaces for provider swapping:

- `src/services/llm/base.py` → `ClaudeLLM`, `OllamaLLM`
- `src/services/transcription/base.py` → `WhisperSTT`
- `src/services/rag/base.py` → `BaseEmbedding`, `BaseVectorStore`
- `.env` `LLM_PROVIDER=claude` or `LLM_PROVIDER=ollama` switches providers
- `.env` `EMBEDDING_PROVIDER=local` or `EMBEDDING_PROVIDER=ollama` switches embedding models
- Never import concrete implementations directly in business logic

### Service Layer Pattern

```
UI (Streamlit) → HTTP/WebSocket only
    ↓
API (FastAPI routes) → delegates to services only (no business logic)
    ↓
Services (business logic) → DB/File/LLM/RAG calls
    ↓
Data Layer (SQLite via SQLAlchemy, ChromaDB for vectors, file system)
```

**Rules**:
- UI never calls services directly (must go through API)
- API routes contain no business logic
- Services never construct HTTP response objects
- Each pipeline step is independently testable

### Token Optimization — Hierarchical Summarization

```
Original transcript (1 hour) ≈ 12,000 tokens
    ↓ (1-min LLM summary × 60)
Level 1: 60 × 1-min summaries ≈ 9,000 tokens (25% reduction)
    ↓ (10-min integration × 6)
Level 2: 6 × 10-min summaries ≈ 1,800 tokens (80% reduction)
    ↓ (1-hour integration)
Level 3: 1 × hour summary ≈ 600 tokens (95% reduction)
```

Cost impact: 14h recording goes from ~$5.60 → ~$0.23 (96% savings).

### Cross-Boundary Extraction

Users can select any time range (e.g., 00:40–01:20) spanning multiple
internal hour files. The system:
1. Finds all 1-min summaries in that range via SQL `BETWEEN` query
2. Re-summarizes the selected summaries into a new document
3. Hour boundaries are invisible to the user (seamless UX)

### RAG Architecture (Retrieval-Augmented Generation)

Every 1-min summary is automatically embedded and stored in ChromaDB.
Users can query past recordings with natural language:

```
User: "지난주 강의에서 RAG에 대해 뭐라고 했지?"
    ↓
1. Embed query → sentence-transformers (all-MiniLM-L6-v2)
    ↓
2. ChromaDB similarity search → Top-K summaries (default K=5)
    ↓
3. Re-rank by metadata (date, category, confidence)
    ↓
4. LLM generates grounded answer with citations
    ↓
Output: "1월 25일 Advanced AI 강의에서 RAG는... [source: recording-2026-01-25]"
```

**Embedding Strategy**:
- Each 1-min summary → 1 embedding vector (384-dim, MiniLM)
- Metadata stored alongside: recording_id, minute_index, category, keywords, date
- Ollama embeddings (nomic-embed-text) available for fully offline RAG
- Incremental indexing: new summaries are embedded as they're created

**Vector Store**: ChromaDB (local SQLite backend, zero-config)
- Collection: `voicevault_summaries`
- Distance metric: cosine similarity
- Persistent storage: `data/chroma_db/`

### Obsidian Integration

VoiceVault generates Obsidian-compatible Markdown exports:

```markdown
---
title: "[강의] Advanced AI - LangChain & Agents"
date: 2026-02-10T10:30:00Z
type: lecture_note
category: lecture
duration: "01:30:00"
tags: [AI, LangChain, Agent, RAG]
keywords: [artificial_intelligence, langchain, agent_design]
speakers: [Professor Kim]
recording_id: rec-2026-02-10-103000
confidence: 0.92
---

## 📝 Summary
- Key concept 1: LangChain fundamentals...
- Key concept 2: Agent design patterns...

## 🔗 Related Notes
- [[2026-02-03 AI Lecture - Transformer Basics]]
- [[Study Session - LangGraph Deep Dive]]

## 📋 Full Transcript
(collapsed section with timestamped transcript)
```

**Future**: Obsidian Community Plugin (`obsidian-voice-rag`) that embeds
the recording UI + RAG search directly inside Obsidian sidebar.

---

## Database Schema (SQLite + ChromaDB)

### Core Tables (v0.1.0 — Week 1)

```sql
recordings (id, started_at, ended_at, audio_path, status, total_minutes)
transcripts (id, recording_id, minute_index, text, confidence, language, created_at)
summaries (id, recording_id, minute_index, summary_text, keywords[JSON], speakers[JSON], confidence, model_used, created_at)
```

### Extended Tables (v0.2.0 — Week 2)

```sql
hour_summaries (id, recording_id, hour_index, summary_text, keywords[JSON], topic_segments[JSON], token_count)
classifications (id, recording_id, template_id, template_name, start_minute, end_minute, confidence, result_json, export_path)
templates (id, name, display_name, triggers[JSON], output_format, fields[JSON], icon, priority, is_default, is_active)
rag_queries (id, query_text, results_json, model_used, answer_text, sources[JSON], created_at)
```

### ChromaDB Vector Store (v0.2.0 — Week 2)

```
Collection: voicevault_summaries
├── id: "summary-{recording_id}-{minute_index}"
├── document: summary_text (plain text)
├── embedding: 384-dim vector (MiniLM or nomic-embed-text)
└── metadata:
    ├── recording_id: int
    ├── minute_index: int
    ├── category: str (lecture/meeting/personal/...)
    ├── keywords: str (comma-separated)
    ├── speakers: str (comma-separated)
    ├── confidence: float
    ├── date: str (ISO 8601)
    └── hour_index: int
```

### Key Indexes

- `transcripts(recording_id, minute_index)` — time-based lookup
- `summaries(recording_id, minute_index)` — cross-boundary range queries
- `recordings(status)` — active/completed filtering
- `templates(name)` — unique constraint for template lookup
- ChromaDB: automatic HNSW index on embedding vectors

---

## Code Conventions

### Python Style

- **Python 3.12** (managed via uv) with type hints on all function signatures
- **Pydantic v2** for all data models (request, response, config)
- **async/await** for all I/O operations (FastAPI, WebSocket, DB, LLM calls)
- **Google-format docstrings**
- **Max line length**: 100 characters
- **Linter/Formatter**: Ruff

### Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Files | `snake_case.py` | `minute_summarizer.py` |
| Classes | `PascalCase` | `MinuteSummarizer` |
| Functions/Variables | `snake_case` | `summarize_minute()` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_TOKENS = 200` |
| Private methods | `_leading_underscore` | `_call_llm()` |

### Import Order

```python
# 1. Standard library
import os
from datetime import datetime

# 2. Third-party packages
from fastapi import FastAPI, WebSocket
from pydantic import BaseModel

# 3. Local imports
from src.core.config import get_settings
from src.services.llm.base import BaseLLM
```

Separate each group with a blank line.

---

## Common Patterns

### Adding a new LLM provider

1. Create `src/services/llm/new_provider.py`
2. Implement `BaseLLM` interface from `src/services/llm/base.py`
3. Add config fields in `src/core/config.py`
4. Register in provider factory at `src/services/llm/__init__.py`
5. Add to `.env.example` with documentation

### Adding a new classification template

1. Create JSON file in `templates/` directory
2. Format: `{ "name": "...", "triggers": [...], "output_format": "...", "fields": [...] }`
3. Run `python scripts/seed_templates.py` to load into DB
4. Template becomes available for zero-shot classification

### Adding a new API route

1. Create route file in `src/api/routes/`
2. Define Pydantic request/response models in `src/core/models.py`
3. Implement service logic in `src/services/`
4. Delegate from route to service (thin wrapper)
5. Register router in `src/api/app.py`
6. Add tests in `tests/unit/` and `tests/integration/`

### Adding a new embedding provider

1. Create `src/services/rag/new_embedding.py`
2. Implement `BaseEmbedding` interface from `src/services/rag/base.py`
3. Add config fields in `src/core/config.py`
4. Register in provider factory at `src/services/rag/__init__.py`
5. Add to `.env.example` with documentation

### Customizing Obsidian export format

1. Edit export templates in `templates/obsidian/` directory
2. Modify `src/services/storage/export.py` for generation logic
3. Frontmatter fields are defined in `src/core/models.py` → `ObsidianExportModel`
4. Wikilinks are auto-generated from RAG similarity results

### Adding a new feature (full checklist)

1. `src/core/models.py` — Pydantic data models
2. `src/services/` — Business logic implementation
3. `src/api/routes/` — API endpoint (thin wrapper)
4. `src/api/app.py` — Register router
5. `tests/unit/` — Unit tests (mock external deps)
6. `tests/integration/` — Integration tests

---

## API Endpoints Overview

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `WS /ws/transcribe?recording_id={id}` | Real-time audio→text streaming |

Client sends: audio bytes (PCM 16-bit, 16kHz, mono)
Server sends: JSON `{type: "transcript"|"summary"|"error", data: {...}}`

### REST (Base: `/api/v1`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/recordings` | Start new recording |
| `PATCH` | `/recordings/{id}/stop` | Stop recording → trigger classification |
| `GET` | `/recordings` | List recordings (with filters) |
| `GET` | `/recordings/{id}` | Get recording details |
| `GET` | `/recordings/{id}/summaries` | List 1-min summaries |
| `GET` | `/recordings/{id}/hour-summaries` | List hour summaries |
| `POST` | `/recordings/{id}/extract` | Cross-boundary range re-summarize |
| `GET` | `/recordings/{id}/classifications` | Get classification results |
| `PATCH` | `/classifications/{id}` | Manual classification override |
| `GET` | `/templates` | List templates |
| `POST` | `/templates` | Create template |
| `POST` | `/recordings/{id}/export` | Export as Obsidian Markdown |
| `POST` | `/rag/query` | RAG search across all recordings |
| `GET` | `/rag/similar/{recording_id}` | Find similar past recordings |
| `POST` | `/rag/reindex` | Rebuild vector index |

### Error Response Format

```json
{
  "detail": "Recording not found",
  "code": "RECORDING_NOT_FOUND",
  "timestamp": "2026-02-10T09:00:00Z"
}
```

---

## Testing Strategy

- **Unit tests** (`tests/unit/`): Mock LLM/STT providers, test pure service logic
- **Integration tests** (`tests/integration/`): Real in-memory SQLite, mock external APIs
- **Fixtures** (`tests/fixtures/`): Sample audio WAV + transcript JSON
- **Minimum coverage**: 70% for service layer
- **Framework**: pytest + pytest-asyncio + pytest-cov

```python
# Example: Mocking LLM for unit test
@pytest.fixture
def mock_llm():
    llm = AsyncMock(spec=BaseLLM)
    llm.generate.return_value = '{"summary": "test", "keywords": ["AI"]}'
    return llm
```

---

## Environment Variables

```env
# LLM Provider: "claude" or "ollama"
LLM_PROVIDER=ollama

# Claude API (when LLM_PROVIDER=claude)
CLAUDE_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-20250514

# Ollama (when LLM_PROVIDER=ollama)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

# Whisper STT
WHISPER_PROVIDER=local          # "local" or "api"
WHISPER_MODEL=base              # base, small, medium, large-v3, turbo
WHISPER_API_KEY=                # OpenAI key (if provider=api)

# RAG & Embeddings
EMBEDDING_PROVIDER=local        # "local" (sentence-transformers) or "ollama"
EMBEDDING_MODEL=all-MiniLM-L6-v2  # sentence-transformers model name
OLLAMA_EMBEDDING_MODEL=nomic-embed-text  # Ollama embedding model (if provider=ollama)
CHROMA_PERSIST_DIR=data/chroma_db
RAG_TOP_K=5                     # Number of results for RAG queries
RAG_MIN_SIMILARITY=0.3          # Minimum cosine similarity threshold

# Obsidian Export
OBSIDIAN_VAULT_PATH=            # Optional: direct export to Obsidian vault
OBSIDIAN_EXPORT_FOLDER=VoiceVault  # Subfolder within vault for exports
OBSIDIAN_FRONTMATTER=true       # Include YAML frontmatter in exports
OBSIDIAN_WIKILINKS=true         # Use [[wikilinks]] for related notes

# Application
APP_HOST=0.0.0.0
APP_PORT=8000
LOG_LEVEL=INFO

# Storage
DATABASE_URL=sqlite:///data/voicevault.db
RECORDINGS_DIR=data/recordings
EXPORTS_DIR=data/exports
```

---

## Hackathon Timeline

### Week 1 (Feb 7–13): Core Pipeline → v0.1.0

| Day | Task | Deliverable |
|-----|------|-------------|
| 1–2 | Project setup + FastAPI + WebSocket | Server boots, /health works |
| 2–3 | Whisper STT real-time transcription | Audio → text streaming |
| 3–4 | 1-min auto-summary (Claude/Ollama) | Summary JSON output |
| 4–5 | SQLite schema + CRUD repository | Data persistence |
| 5–6 | Streamlit basic UI (record + summaries) | Web interface |
| 7 | E2E integration test + bug fixes | **Week 1 MVP complete** |

**Success Criteria**: 30s recording → real-time transcript → 1-min summary → saved in DB

### Week 2 (Feb 14–20): Classification + RAG + Obsidian → v0.2.0

| Day | Task | Deliverable |
|-----|------|-------------|
| 8–9 | Zero-shot classification + templates | Auto document typing |
| 9–10 | RAG: ChromaDB + embeddings + search API | Query past recordings |
| 10–11 | Cross-boundary search + re-summary | Any time range selection |
| 11–12 | Obsidian Markdown export (frontmatter + wikilinks) | PKM-ready export |
| 12–13 | RAG search UI + improved Streamlit | Timeline, template mgmt, RAG panel |
| 14 | Final testing + demo prep | **Complete MVP** |

**Success Criteria**: 1h recording → classify → RAG search → export as Obsidian Markdown

### Final (Feb 21–22): Demo Ready → v0.3.0

- Demo scenario: 8-hour simulated recording
- RAG demo: natural language query across all recordings
- Obsidian vault integration demo
- Presentation slides + demo video
- README & documentation polish

---

## Performance Targets

| Metric | Target | How |
|--------|--------|-----|
| 1-min summarization | < 10 seconds | Efficient prompt + async |
| WebSocket transcription latency | < 3 seconds | Whisper base model |
| Classification accuracy | > 85% | Claude zero-shot + templates |
| Hour summary generation | < 30 seconds | Hierarchical compression |
| Cross-boundary query | < 2 seconds | SQLite indexes on minute_index |
| 12-hour continuous recording | Stable | 1-hour internal file splits |
| RAG query response | < 5 seconds | ChromaDB HNSW + cached embeddings |
| Embedding generation | < 1 second/summary | Local MiniLM (384-dim) |
| RAG relevance (recall@5) | > 80% | Metadata-enhanced retrieval |
| Obsidian export | < 3 seconds/recording | Template-based Markdown gen |

---

## Security Rules

- **Never commit** `.env` files or API keys
- **Never hardcode** API keys or model names in source code
- **Validate** all user inputs (Pydantic models handle this)
- **Sanitize** file paths (prevent directory traversal attacks)
- **Rate limit** API endpoints (Claude API: 5 req/min → use asyncio.Semaphore)

---

## Git Conventions

### Branch Strategy

```
main            ← stable (demo-ready)
└── develop     ← integration branch
    ├── feat/   ← new features
    ├── fix/    ← bug fixes
    └── docs/   ← documentation
```

### Commit Message Format

```
type(scope): description

# Types: feat, fix, docs, style, refactor, test, chore
# Scopes: stt, llm, rag, ui, api, storage, classification, template, obsidian

# Examples:
feat(stt): add Whisper WebSocket streaming endpoint
fix(classification): handle empty transcript edge case
docs(wiki): update API reference for export endpoint
test(llm): add unit tests for Claude provider
chore(ci): update GitHub Actions Python matrix
```

---

## Tips for Working on This Codebase

1. **Use uv, not pip**: 패키지 관리는 반드시 `uv pip install ...`로 수행. `pip`/`python -m venv` 사용 금지. Python 3.12는 `uv venv --python 3.12`로 관리.
2. **Start with services**: Core logic is in `src/services/`. Understand the ABC interfaces first (`base.py` files).
3. **Provider agnostic**: Always test with both Claude AND Ollama. Never assume one provider.
4. **SQLite is sufficient**: Don't over-engineer the storage layer. Local-first is the principle.
5. **Streamlit quirks**: Use `st.session_state` for persistent state across reruns. Streamlit re-executes the entire script on every interaction.
6. **WebSocket**: Real-time transcription uses FastAPI WebSocket, not REST polling.
7. **Templates are JSON**: Default templates in `templates/` dir, user custom templates in DB.
8. **Hackathon mindset**: Working demo > Perfect code. Ship early, iterate fast.
9. **Async everywhere**: All service methods should be `async`. Use `await` for I/O.
10. **Test with real audio**: Use `tests/fixtures/sample_audio.wav` for realistic testing. Dummy data tests miss edge cases.
11. **Claude rate limits**: 5 req/min on free tier. Always use `asyncio.Semaphore` for concurrent calls.
12. **Token budget**: Each 1-min summary should be ≤ 50 tokens to keep costs manageable.
13. **Cross-boundary is key UX**: The invisible hour boundaries + free time range selection is a major differentiator. Prioritize this feature.
14. **RAG is core**: ChromaDB for vector storage, sentence-transformers for local embeddings. Embed every summary as it's created (incremental, not batch).
15. **Embedding provider agnostic**: Like LLM, support both local (sentence-transformers) and Ollama (nomic-embed-text) embedding models.
16. **ChromaDB is zero-config**: No separate server needed. It runs in-process with SQLite backend. Perfect for local-first.
17. **Obsidian frontmatter**: Always include YAML frontmatter in exports. Fields: title, date, type, category, tags, keywords, speakers, recording_id, confidence.
18. **Wikilinks from RAG**: Use RAG similarity to auto-generate `[[wikilinks]]` in exported Markdown, connecting related recordings.
19. **Obsidian plugin is future**: MVP uses Streamlit UI + Obsidian-compatible Markdown export. Full Obsidian plugin (TypeScript) is the v1.0 goal.

---

## Demo Scenario (8-hour Simulation)

```
1️⃣ 09:00–09:45  Friend chat at café
   "The project deadline is next Friday..."

2️⃣ 10:30–12:00  Lecture (Advanced AI)
   "Today we'll learn about LangChain and Agent design..."

3️⃣ 12:00–13:00  Lunch with another friend
   "How's the semester? Lots of assignments?"

4️⃣ 13:00–18:00  Library solo study
   "Hmm, the LangGraph checkpoint system is important..."

[Recording stops]
[AI processing: ~30 seconds]

[Results]
├── 📚 Lecture Note
│   └── Advanced AI - LangChain & Agents
├── 👥 Friend Notes (2)
│   ├── Sarah - Project Meeting
│   └── Friend2 - Academic Check-in
└── 💡 Personal Memo
    └── Study Session - LangGraph Deep Dive

[User Action 1: Cross-boundary extraction]
Select: 00:40 ~ 01:20 (important part across hour boundary)
  → System extracts & re-summarizes that range
  → Cross-references with lecture content
  → Exports as structured Markdown

[User Action 2: RAG Search]
Query: "LangChain Agent 설계 패턴에 대해 뭐라고 했지?"
  → ChromaDB similarity search across all recordings
  → Found: Lecture (10:30–12:00) + Study session (13:00–18:00)
  → LLM generates: "Advanced AI 강의에서 Agent 설계 패턴은..."
  → Sources linked: [[Advanced AI - LangChain & Agents]]

[User Action 3: Obsidian Export]
Export all → Obsidian vault/VoiceVault/
  ├── 📚 [강의] Advanced AI - LangChain & Agents.md (with frontmatter)
  ├── 👥 [대화] Sarah - Project Meeting.md
  ├── 👥 [대화] Friend2 - Academic Check-in.md
  └── 💡 [메모] Study Session - LangGraph Deep Dive.md
  → Each file has [[wikilinks]] to related notes (from RAG similarity)
```
