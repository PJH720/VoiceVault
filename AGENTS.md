# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

VoiceVault is an AI voice recorder with a Python/FastAPI backend and Next.js 16 frontend. See `README.md` for full architecture and `Makefile` for standard dev commands.

### Running services

| Service | Command | Port |
|---------|---------|------|
| Backend | `PYTHONPATH=backend backend/.venv/bin/uvicorn src.api.app:app --reload --port 8000` | 8000 |
| Frontend | `cd frontend && pnpm dev` | 3000 |

### Gotchas

- The `.env` file's `DATABASE_URL` must use the async driver: `sqlite+aiosqlite:///data/voicevault.db` (not `sqlite:///`). The `.env.example` ships with the sync prefix, which causes `InvalidRequestError` at startup.
- Backend venv is at `backend/.venv`; always use `PYTHONPATH=backend` when running backend commands from the workspace root.
- Backend tests live in `/workspace/tests/` (root level), **not** `backend/tests/`. Run them with: `PYTHONPATH=backend backend/.venv/bin/pytest tests/unit/ -v --no-cov`.
- `pytest.ini` at root controls test configuration. Tests use `LLM_PROVIDER=mock` and in-memory SQLite, so no Ollama or Claude is needed for testing.
- The `pnpm install` in frontend may warn about ignored build scripts for `esbuild`. Add `"pnpm": {"onlyBuiltDependencies": ["esbuild"]}` to `frontend/package.json` or run `pnpm approve-builds` interactively to fix.
- `ruff` and other Python dev tools are installed inside `backend/.venv` via `uv pip install -e ".[dev]"`.
- The `--reload` flag for uvicorn watches the entire `/workspace` tree; for faster reloads, consider narrowing with `--reload-dir backend/src`.

### Lint / Test / Build commands

See `Makefile` at workspace root. Key commands:
- **Backend lint**: `ruff check backend/src/ backend/tests/` and `ruff format --check backend/src/ backend/tests/` (use `backend/.venv/bin/ruff`)
- **Frontend lint**: `cd frontend && pnpm lint && pnpm format:check && pnpm type-check`
- **Backend tests**: `PYTHONPATH=backend backend/.venv/bin/pytest tests/unit/ -v`
- **Frontend tests**: `cd frontend && pnpm test`
- **Frontend build**: `cd frontend && pnpm build`
