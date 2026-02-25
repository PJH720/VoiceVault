# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VoiceVault is an AI voice recorder that transcribes, summarizes, auto-classifies recordings into structured notes, and uses RAG to search across your vault. Built for 서강대학교 러너톤 2026 해커톤 (2-week MVP).

**Stack**: Python 3.12 (uv) | FastAPI | Next.js 16 | TypeScript | faster-whisper | Claude/Ollama | SQLite | ChromaDB

---

## Key Commands

All development is managed through the Makefile. Run `make` targets from the repo root.

```bash
# ── Development ──
make dev                 # Run backend (port 8000) + frontend (port 3000) concurrently
make dev-backend         # Backend only: PYTHONPATH=backend uvicorn src.api.app:app --reload --port 8000
make dev-frontend        # Frontend only: cd frontend && pnpm dev

# ── Testing ──
pytest tests/ -v                              # All backend tests (run from repo root)
pytest tests/unit/ -v                         # Unit only
pytest tests/integration/ -v                  # Integration only
pytest tests/unit/test_summarizer.py -v       # Single file
pytest tests/unit/test_summarizer.py::TestClass::test_name -v  # Single test
cd frontend && pnpm test                      # Frontend unit tests (Vitest)
cd frontend && pnpm test:e2e                  # Frontend E2E (Playwright)

# ── Linting & Formatting ──
make lint                # Lint all (backend + frontend)
ruff check src/ tests/ --fix   # Backend lint + auto-fix (from root)
ruff format src/ tests/        # Backend format (from root)
mypy src/ --ignore-missing-imports  # Type check
cd frontend && pnpm lint && pnpm type-check  # Frontend lint + tsc

# ── Code Generation ──
make gen-openapi         # Export OpenAPI schema → docs/openapi.json
make gen-types           # Generate TypeScript types → frontend/src/types/api.generated.ts

# ── Setup ──
make setup               # Full setup: uv venv + pip install + pnpm install + Whisper model + seed templates

# ── Docker ──
make up                  # Start containers (backend + frontend)
make up-ollama           # Include Ollama (--profile ollama)
make down / make logs / make clean
```

### Manual commands (without Make)

```bash
# Backend dev server — always set PYTHONPATH=backend
PYTHONPATH=backend uvicorn src.api.app:app --reload --port 8000

# Backend tests — run from repo root (tests/ lives at root, not inside backend/)
pytest tests/ -v

# Seeds
PYTHONPATH=backend python backend/scripts/seed_templates.py
PYTHONPATH=backend python backend/scripts/seed_demo_data.py
```

**Critical**: `PYTHONPATH=backend` makes Python resolve `from src.xxx` to `backend/src/xxx`. The Makefile sets this automatically. Tests are run from **repo root** where `pytest.ini` and `tests/` live.

---

## Repository Structure

```
VoiceVault/
├── src/                           # Root-level src — active backend code, tested by tests/
│   ├── core/                      # config.py, models.py, exceptions.py, utils.py
│   ├── services/                  # All business logic (same structure as backend/src/services/)
│   ├── api/                       # FastAPI app, routes, websocket, middleware
│   └── ui/                        # [DEPRECATED] Streamlit frontend — do NOT modify, will be removed in v0.6.0
│
├── backend/                       # v0.4.0 backend — slightly newer, run by Makefile dev server
│   └── src/                       # Same structure as root src/; differs by: configurable CORS,
│       └── ...                    # no ui/ subdirectory; used by PYTHONPATH=backend invocations
│
├── frontend/                      # Next.js 16 + TypeScript (replaces Streamlit)
│   ├── src/app/                   # App Router pages (recording/, summaries/)
│   ├── src/components/            # UI components
│   ├── src/hooks/                 # useWebSocket, useAudioCapture, useRecordings, useSummaries
│   ├── src/lib/                   # api-client.ts, websocket/, audio/
│   ├── src/stores/recording.ts    # Zustand recording session state
│   └── src/types/api.generated.ts # Auto-generated from OpenAPI
│
├── tests/                         # Backend tests (pytest — run from repo root)
│   ├── unit/                      # Mocked LLM/STT, pure service logic
│   ├── integration/               # Real in-memory SQLite, mocked external APIs
│   ├── e2e/                       # Full pipeline tests
│   ├── stress/                    # Long-running simulation
│   └── conftest.py
│
├── templates/                     # Default classification templates (JSON)
├── scripts/                       # Dev utilities (download_models.py, seed_*.py, export_openapi.py)
├── docs/openapi.json              # Auto-generated OpenAPI schema
├── data/                          # Runtime data (gitignored): recordings, exports, chroma_db, DB
├── Makefile                       # Unified dev commands
├── pyproject.toml                 # Root Python project config
├── pytest.ini                     # pytest config (testpaths = tests, asyncio_mode = auto)
└── docker-compose.yml
```

---

## Architecture

### Layer Separation (strict)

```
Frontend (Next.js) → HTTP/WebSocket only
    ↓
API (FastAPI routes) → delegates to services, no business logic
    ↓
Services → all business logic (DB, LLM, RAG, audio)
    ↓
Data Layer (SQLite via SQLAlchemy, ChromaDB, filesystem)
```

- Frontend never imports services directly
- API routes contain no logic (thin wrappers)
- Services never construct HTTP response objects

### Data Pipeline

```
[Real-time]  Mic → WebSocket → faster-whisper STT → transcript → SQLite
                                                  → every 60s LLM summarize → SQLite + ChromaDB embed

[Post-stop]  1-min summaries → hour integration (60→6→1, 95% token reduction)
                             → zero-shot classification against templates
                             → Obsidian Markdown export

[RAG query]  Embed query → ChromaDB similarity (top-K) → re-rank → LLM answer with citations
```

### Provider Abstraction

All external services use ABC interfaces — swapped via `.env`:

- `LLM_PROVIDER=claude|ollama` → `src/services/llm/{claude,ollama}.py` implements `BaseLLM`
- `EMBEDDING_PROVIDER=local|ollama` → `src/services/rag/embeddings.py` implements `BaseEmbedding`
- `src/services/transcription/whisper.py` implements `BaseSTT`

Never import concrete providers in business logic.

### API Contract (OpenAPI → TypeScript)

```bash
# After changing any backend API endpoint:
make gen-openapi    # Backend → docs/openapi.json
make gen-types      # docs/openapi.json → frontend/src/types/api.generated.ts
```

CI (`api-contract-check` job) validates these are in sync.

---

## Code Conventions

### Python (Backend)

- Python 3.12, type hints on all signatures
- Pydantic v2 for all data models
- `async/await` for all I/O — all service methods must be async
- Ruff (line-length=100, config in `pyproject.toml`)
- Google-format docstrings
- Imports: stdlib → third-party → local, blank line between groups

### TypeScript (Frontend)

- Strict mode (`strict: true`, `noUncheckedIndexedAccess: true`)
- App Router (`src/app/`), React 19, Tailwind CSS v4
- Zustand for client state, React Query for server state
- Path alias `@/*` → `./src/*`
- Components: `PascalCase.tsx`; utilities: `kebab-case.ts`

---

## Testing

- `asyncio_mode = "auto"` in pytest config — no `@pytest.mark.asyncio` needed
- Tests use in-memory SQLite (`DATABASE_URL=sqlite+aiosqlite:///:memory:` set in pytest.ini)
- Mock external providers: `AsyncMock(spec=BaseLLM)`
- Markers: `@pytest.mark.unit`, `@pytest.mark.integration`, `@pytest.mark.e2e`, `@pytest.mark.stress`

```python
# Standard LLM mock pattern
@pytest.fixture
def mock_llm():
    llm = AsyncMock(spec=BaseLLM)
    llm.generate.return_value = '{"summary": "test", "keywords": ["AI"]}'
    return llm
```

---

## Common Patterns

### Adding a new LLM provider
1. `src/services/llm/new_provider.py` — implement `BaseLLM`
2. Add config in `src/core/config.py`
3. Register in `src/services/llm/__init__.py`
4. Add to `.env.example`

### Adding a new API route
1. `src/core/models.py` — Pydantic request/response models
2. `src/services/` — business logic
3. `src/api/routes/new_route.py` — thin wrapper delegating to service
4. `src/api/app.py` — register router
5. `tests/unit/` + `tests/integration/`
6. `make gen-openapi && make gen-types`

### Adding a classification template
1. Create JSON in `templates/` — `{ "name", "triggers", "output_format", "fields" }`
2. `PYTHONPATH=backend python backend/scripts/seed_templates.py`

---

## Key Files

| File | Purpose |
|------|---------|
| `src/core/config.py` | Pydantic Settings, all env vars |
| `src/core/models.py` | All Pydantic request/response models |
| `src/core/exceptions.py` | `VoiceVaultError` hierarchy |
| `src/services/orchestrator.py` | Recording session background pipeline |
| `src/services/storage/models_db.py` | SQLAlchemy ORM models |
| `src/services/storage/repository.py` | All CRUD operations |
| `src/api/app.py` | App factory, router registration |
| `frontend/src/stores/recording.ts` | Zustand recording session state |
| `frontend/src/lib/api-client.ts` | Fetch wrapper for backend API |

---

## Environment Variables

```env
LLM_PROVIDER=ollama                    # "claude" or "ollama"
CLAUDE_API_KEY=
CLAUDE_MODEL=claude-sonnet-4-20250514
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
WHISPER_MODEL=base                     # base, small, medium, large-v3, turbo
EMBEDDING_PROVIDER=local               # "local" (sentence-transformers) or "ollama"
EMBEDDING_MODEL=all-MiniLM-L6-v2
CHROMA_PERSIST_DIR=data/chroma_db
RAG_TOP_K=5
DATABASE_URL=sqlite:///data/voicevault.db
CORS_ORIGINS=["http://localhost:8501","http://localhost:3000"]
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

---

## Gotchas

- **PYTHONPATH=backend** is mandatory for running the backend server manually; always set it or use `make` targets.
- **Tests live at root `tests/`**, not `backend/tests/`. Run `pytest tests/ -v` from repo root.
- **Root `src/` vs `backend/src/`**: Both contain the same service structure. Root `src/` is what tests import; `backend/src/` is what the dev server runs (slightly newer — uses configurable CORS). Keep them in sync when editing services.
- **Claude API rate limit**: 5 req/min on free tier; use `asyncio.Semaphore` for concurrent calls.
- **1-min summary target**: ≤ 50 tokens to keep costs low.
- **ChromaDB runs in-process** (zero-config, no separate server), persists to `data/chroma_db/`.
- **[DEPRECATED] Streamlit (`src/ui/`)** is deprecated and will be removed in v0.6.0. Do NOT add features to it. Use the Next.js frontend (`frontend/`) exclusively.
- **After any API change**: run `make gen-openapi && make gen-types` to keep TypeScript types in sync.
- **pnpm only**: Frontend uses pnpm. Never use npm or yarn.
- **uv only**: Backend uses uv. Never use pip or python -m venv directly.

---

## Git Conventions

```
type(scope): description

# Types: feat, fix, docs, style, refactor, test, chore
# Scopes: stt, llm, rag, ui, api, storage, classification, template, obsidian, frontend, infra, ci
```

Branches: `main` (stable) ← `feat/`, `fix/`, `docs/`
