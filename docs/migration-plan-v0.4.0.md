# v0.4.0 Migration Plan: Backend Directory Restructure

> Issue: #73 | Phase: A1 (Planning & Scaffold)  
> Created: 2026-02-15

## 1. Overview

Move backend-related code (`src/api`, `src/core`, `src/services`, `tests/`, `scripts/`) into a `backend/` directory to prepare for future monorepo structure. The Streamlit UI (`src/ui/`) stays at root and will be removed separately.

## 2. File-by-File Move Map

### src/ → backend/src/

| Source | Target |
|--------|--------|
| `src/__init__.py` | `backend/src/__init__.py` |
| `src/api/__init__.py` | `backend/src/api/__init__.py` |
| `src/api/app.py` | `backend/src/api/app.py` |
| `src/api/websocket.py` | `backend/src/api/websocket.py` |
| `src/api/routes/__init__.py` | `backend/src/api/routes/__init__.py` |
| `src/api/routes/recording.py` | `backend/src/api/routes/recording.py` |
| `src/api/routes/summary.py` | `backend/src/api/routes/summary.py` |
| `src/api/routes/rag.py` | `backend/src/api/routes/rag.py` |
| `src/api/routes/template.py` | `backend/src/api/routes/template.py` |
| `src/api/middleware/__init__.py` | `backend/src/api/middleware/__init__.py` |
| `src/api/middleware/error_handler.py` | `backend/src/api/middleware/error_handler.py` |
| `src/core/__init__.py` | `backend/src/core/__init__.py` |
| `src/core/config.py` | `backend/src/core/config.py` |
| `src/core/models.py` | `backend/src/core/models.py` |
| `src/core/utils.py` | `backend/src/core/utils.py` |
| `src/core/exceptions.py` | `backend/src/core/exceptions.py` |
| `src/services/__init__.py` | `backend/src/services/__init__.py` |
| `src/services/audio/__init__.py` | `backend/src/services/audio/__init__.py` |
| `src/services/audio/recorder.py` | `backend/src/services/audio/recorder.py` |
| `src/services/classification/__init__.py` | `backend/src/services/classification/__init__.py` |
| `src/services/classification/classifier.py` | `backend/src/services/classification/classifier.py` |
| `src/services/classification/template_matcher.py` | `backend/src/services/classification/template_matcher.py` |
| `src/services/llm/__init__.py` | `backend/src/services/llm/__init__.py` |
| `src/services/llm/base.py` | `backend/src/services/llm/base.py` |
| `src/services/llm/claude.py` | `backend/src/services/llm/claude.py` |
| `src/services/llm/ollama.py` | `backend/src/services/llm/ollama.py` |
| `src/services/transcription/__init__.py` | `backend/src/services/transcription/__init__.py` |
| `src/services/transcription/base.py` | `backend/src/services/transcription/base.py` |
| `src/services/transcription/whisper.py` | `backend/src/services/transcription/whisper.py` |
| `src/services/summarization/__init__.py` | `backend/src/services/summarization/__init__.py` |
| `src/services/summarization/base.py` | `backend/src/services/summarization/base.py` |
| `src/services/summarization/minute_summarizer.py` | `backend/src/services/summarization/minute_summarizer.py` |
| `src/services/summarization/hour_summarizer.py` | `backend/src/services/summarization/hour_summarizer.py` |
| `src/services/summarization/range_extractor.py` | `backend/src/services/summarization/range_extractor.py` |
| `src/services/rag/__init__.py` | `backend/src/services/rag/__init__.py` |
| `src/services/rag/base.py` | `backend/src/services/rag/base.py` |
| `src/services/rag/embeddings.py` | `backend/src/services/rag/embeddings.py` |
| `src/services/rag/retriever.py` | `backend/src/services/rag/retriever.py` |
| `src/services/rag/vectorstore.py` | `backend/src/services/rag/vectorstore.py` |
| `src/services/storage/__init__.py` | `backend/src/services/storage/__init__.py` |
| `src/services/storage/database.py` | `backend/src/services/storage/database.py` |
| `src/services/storage/export.py` | `backend/src/services/storage/export.py` |
| `src/services/storage/models_db.py` | `backend/src/services/storage/models_db.py` |
| `src/services/storage/repository.py` | `backend/src/services/storage/repository.py` |

### tests/ → backend/tests/

| Source | Target |
|--------|--------|
| `tests/conftest.py` | `backend/tests/conftest.py` |
| `tests/unit/*.py` (all files) | `backend/tests/unit/` |
| `tests/integration/*.py` (all files) | `backend/tests/integration/` |
| `tests/e2e/` (if exists) | `backend/tests/e2e/` |
| `tests/stress/` (if exists) | `backend/tests/stress/` |
| `tests/fixtures/` (if exists) | `backend/tests/fixtures/` |

### scripts/ → backend/scripts/

| Source | Target |
|--------|--------|
| `scripts/download_models.py` | `backend/scripts/download_models.py` |
| `scripts/setup_dev.sh` | `backend/scripts/setup_dev.sh` |
| `scripts/seed_templates.py` | `backend/scripts/seed_templates.py` |
| `scripts/seed_demo_data.py` | `backend/scripts/seed_demo_data.py` |
| `scripts/demo_data/__init__.py` | `backend/scripts/demo_data/__init__.py` |
| `scripts/demo_data/scenarios.py` | `backend/scripts/demo_data/scenarios.py` |

## 3. What Stays in Place (NOT moved)

| Path | Reason |
|------|--------|
| `src/ui/` | Streamlit frontend — will be removed separately in later phase |
| `templates/` | Shared data, used by both backend and UI |
| `data/` | Runtime data directory |
| `.env.example` | Root-level config reference |
| `.github/workflows/` | CI config (updated in-place in A3) |
| `pyproject.toml` | Updated in-place in A3 |
| `Makefile` | Updated in-place in A3 |
| `Dockerfile` | Updated in-place in A3 |
| `docker-compose.yml` | Updated in-place in A3 |
| `requirements.txt` | Updated in-place in A3 |
| `docs/` | Documentation stays at root |

## 4. PYTHONPATH Strategy

### Current State
- Imports use `from src.core.config import ...`
- `PYTHONPATH=.` (project root)

### After Migration
- Imports change to `from src.core.config import ...` (same package-relative style)
- `PYTHONPATH=backend` (or `PYTHONPATH=backend:. ` if src/ui still needs root)
- Alternative: Add `sys.path.insert(0, "backend")` in entry points

### Migration Steps
1. Move files first (A2)
2. Update all imports with sed/find-replace (A2)
3. Set `PYTHONPATH` in:
   - `Dockerfile` → `ENV PYTHONPATH=/app/backend`
   - `docker-compose.yml` → `environment: PYTHONPATH=/app/backend`
   - `Makefile` → prefix commands with `PYTHONPATH=backend`
   - `.github/workflows/*.yml` → `env: PYTHONPATH=backend`
   - `pyproject.toml` → `[tool.pytest.ini_options] pythonpath = ["backend"]`

## 5. Impact Analysis

### Dockerfile
- `COPY src/ ...` → `COPY backend/src/ ...`
- `COPY scripts/ ...` → `COPY backend/scripts/ ...`
- `WORKDIR` and `CMD` paths need updating
- `ENV PYTHONPATH=/app/backend`

### CI (.github/workflows/)
- Test commands: `pytest tests/` → `pytest backend/tests/`
- Lint paths: `src/` → `backend/src/`
- PYTHONPATH env variable addition
- Coverage source paths

### Makefile
- All target paths referencing `src/`, `tests/`, `scripts/`
- PYTHONPATH prefix on run/test commands

### pyproject.toml
- `[tool.pytest.ini_options]` → testpaths, pythonpath
- `[tool.ruff]` or `[tool.flake8]` → source paths
- Package discovery config if any

### scripts/
- Internal imports (`from src.xxx`) still work if PYTHONPATH is set correctly
- Shebang/entry points may need path updates

## 6. Rollback Strategy

### Git Revert Approach
The migration will be done across multiple PRs (A1→A2→A3). Each PR is independently revertable:

```bash
# Revert A3 (config updates)
git revert <a3-merge-commit>

# Revert A2 (file moves)
git revert <a2-merge-commit>

# Revert A1 (scaffold — optional, harmless empty dirs)
git revert <a1-merge-commit>
```

### Safety Measures
1. **No code changes in A1** — only empty dirs + docs (this PR)
2. **A2 uses `git mv`** — preserves history, easy to revert
3. **A3 updates configs** — all changes are in tracked files
4. **Branch protection** — all PRs require review before merge
5. **CI must pass** — tests run on every PR

### Emergency Rollback
If something breaks after merge:
```bash
git revert --no-commit <merge-commit>
git commit -m "revert: rollback v0.4.0 migration"
```

## 7. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Import breakage after move | High | High | Automated sed replacement + full test suite in A2 PR |
| Docker build failure | Medium | Medium | Test Docker build in A3 PR CI |
| CI path misconfiguration | Medium | Medium | Verify in A3 PR before merge |
| `src/ui/` breaks (still references `src.core`) | Medium | High | Keep `PYTHONPATH=backend:.` to support both |
| Merge conflicts with in-flight PRs | Low | Medium | Coordinate — merge A1-A3 quickly, rebase other PRs |
| IDE/editor confusion | Low | Low | Update `.vscode/settings.json` if present |

## 8. Execution Order

| Phase | Issue | Description | Depends On |
|-------|-------|-------------|------------|
| A1 | #73 | Scaffold + plan (this PR) | — |
| A2 | #74 | `git mv` all files | A1 merged |
| A3 | #75 | Update configs (Docker, CI, Makefile, pyproject.toml) | A2 merged |
| A4 | #76 | Verification — full test pass, Docker build | A3 merged |
