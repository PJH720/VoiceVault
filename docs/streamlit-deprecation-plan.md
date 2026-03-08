# Streamlit Deprecation Plan

> **Status**: Active (v0.4.0)
> **Created**: 2026-02-16
> **Related Issue**: [#96](https://github.com/PJH720/VoiceVault/issues/96)

## Background

VoiceVault's original UI was built with Streamlit (`src/ui/`). As of v0.4.0,
we've migrated to a Next.js + TypeScript frontend (`frontend/`). This document
defines the feature parity checklist, deprecation timeline, removal criteria,
and dependency cleanup needed to fully retire the Streamlit UI.

---

## 1. Feature Parity Checklist

| Feature | Streamlit (`src/ui/`) | Next.js (`frontend/`) | Priority | Target Version |
|---------|----------------------|-----------------------|----------|----------------|
| Recording (audio capture + live transcript) | ✅ `pages/01_recording.py` | ✅ `app/recording/page.tsx` | P0 | v0.4.0 ✅ |
| Summaries (view 1-min + hour summaries) | ✅ `pages/02_summaries.py` | ✅ `app/summaries/page.tsx` | P0 | v0.4.0 ✅ |
| RAG Search (natural language query) | ✅ `pages/03_rag_search.py` | ❌ Not yet | P1 | v0.5.0 |
| Export (Obsidian Markdown export) | ✅ `pages/04_export.py` | ❌ Not yet | P1 | v0.5.0 |
| Templates (view/create/edit templates) | ✅ `pages/05_templates.py` | ❌ Not yet | P2 | v0.6.0 |

### P0 (v0.4.0 — Complete)

- [x] Recording page with Web Audio API + WebSocket streaming
- [x] Live transcript display during recording
- [x] Summaries page with 1-min summary cards
- [x] Post-recording summary tracking + auto-refresh

### P1 (v0.5.0 — Next)

- [ ] RAG search page with natural language query input
- [ ] Search results with citations and source links
- [ ] Export page with Obsidian Markdown preview
- [ ] Export format selection and vault path configuration
- [ ] Batch export support

### P2 (v0.6.0)

- [ ] Templates list/create/edit/delete UI
- [ ] Template trigger configuration
- [ ] Template field editor

---

## 2. Deprecation Timeline

```
v0.4.0 (Current)     v0.5.0                  v0.6.0
Feb 2026              Q2 2026                 Q3 2026
    │                     │                       │
    ├─ P0 complete        ├─ P1 complete          ├─ P2 complete
    ├─ Deprecation        ├─ Streamlit startup    ├─ DELETE src/ui/
    │  notice added       │  shows warning        ├─ Remove streamlit
    │  to src/ui/app.py   ├─ Docs updated to      │  from requirements
    ├─ New features       │  reference Next.js     ├─ Remove port 8501
    │  ONLY in Next.js    │  only                  │  from CORS config
    └─ Bug fixes:         └─ Bug fixes:            └─ Final cleanup
       critical only         NONE                     commit
```

### Phase 1: Deprecation Notice (v0.4.0 — Now)

- [x] Add deprecation banner to `src/ui/app.py` (visible on every page load)
- [x] Document deprecation plan in `docs/streamlit-deprecation-plan.md`
- [x] Update `wiki/Roadmap.md` with removal milestones
- [x] All new UI features go to `frontend/` only
- [x] Streamlit bug fixes: **critical-only** (data loss, crashes)

### Phase 2: Soft Removal Gate (v0.5.0)

- [ ] P1 features (RAG Search, Export) live in Next.js
- [ ] Streamlit startup prints terminal warning: "Streamlit UI is deprecated"
- [ ] All user-facing docs reference Next.js frontend only
- [ ] `make dev` no longer starts Streamlit by default

### Phase 3: Hard Removal (v0.6.0)

- [ ] P2 features (Templates) live in Next.js
- [ ] Delete `src/ui/` directory entirely
- [ ] Remove Streamlit dependencies from `backend/requirements.txt`
- [ ] Remove `watchdog` if no other consumer
- [ ] Remove port `8501` from `CORS_ORIGINS` in `.env.example`
- [ ] Update `CLAUDE.md` to remove all Streamlit references
- [ ] Update `AGENTS.md` to remove Streamlit from stack description

---

## 3. Removal Criteria

The Streamlit UI (`src/ui/`) can be **fully removed** when ALL of the
following conditions are met:

### Must-Have (Gate)

1. **P0 + P1 feature parity**: Recording, Summaries, RAG Search, and Export
   are all functional in the Next.js frontend
2. **No active Streamlit users**: No bug reports or feature requests
   referencing the Streamlit UI in the last 30 days
3. **CI passes without Streamlit**: All tests pass without `streamlit` in
   the dependency tree

### Nice-to-Have (Non-blocking)

4. P2 feature (Templates) is in Next.js — if not, removal can still
   proceed and Templates gets added to the Next.js backlog
5. Migration guide published for any users still running Streamlit

---

## 4. Dependency Cleanup List

Dependencies to remove from `backend/requirements.txt` when `src/ui/` is deleted:

| Package | Current Version | Used By | Remove With Streamlit? |
|---------|----------------|---------|----------------------|
| `streamlit` | `>=1.40.0` | `src/ui/` only | ✅ Yes |
| `watchdog` | (transitive via streamlit) | Streamlit file watcher | ✅ Yes |

### Configuration Changes

| File | Change |
|------|--------|
| `backend/requirements.txt` | Remove `streamlit>=1.40.0` |
| `.env.example` | Remove `http://localhost:8501` from `CORS_ORIGINS` |
| `Makefile` | Remove any Streamlit-related targets (if any) |
| `CLAUDE.md` | Remove Streamlit references from stack/structure |
| `AGENTS.md` | Update stack description |
| `docker-compose.yml` | Remove Streamlit service (if any) |

---

## 5. Files to Delete

When removal criteria are met, delete the entire `src/ui/` directory:

```
src/ui/
├── app.py                    # Main Streamlit entry point
├── api_client.py             # HTTP client for backend API
├── utils.py                  # UI utility functions
├── assets/
│   └── styles.css            # Custom CSS
├── components/
│   ├── __init__.py
│   ├── recorder.py           # Recording UI component
│   ├── summary_card.py       # Summary card component
│   ├── export_preview.py     # Export preview component
│   ├── rag_result.py         # RAG result component
│   └── template_card.py      # Template card component
└── pages/
    ├── __init__.py
    ├── 01_recording.py       # Recording page
    ├── 02_summaries.py       # Summaries page
    ├── 03_rag_search.py      # RAG Search page
    ├── 04_export.py          # Export page
    └── 05_templates.py       # Templates page
```

**Total**: ~15 files, ~2,000 lines of Python code.

---

## 6. Current State (v0.4.0)

| Aspect | Status |
|--------|--------|
| Streamlit code present | ✅ `src/ui/` exists |
| Deprecation notice | ✅ Added to `src/ui/app.py` |
| New features in Streamlit | ❌ Frozen — Next.js only |
| Critical bug fixes | ✅ Still accepted |
| P0 in Next.js | ✅ Recording + Summaries |
| P1 in Next.js | ❌ RAG Search + Export pending |
| P2 in Next.js | ❌ Templates pending |
