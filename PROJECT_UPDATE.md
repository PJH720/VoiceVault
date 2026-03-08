# PROJECT_UPDATE.md — GitHub Projects Board Manual Actions

> Generated: 2026-03-08 | Context: v0.7.0 Electrobun migration complete; v0.8.0 milestone created.
>
> The GitHub CLI cannot manage Projects v2 board cards directly. These are the manual
> drags/drops needed to bring the board up to date. Open the board at:
> **https://github.com/users/PJH720/projects** (or https://github.com/PJH720/VoiceVault/projects)

---

## 1. Archive / Remove Completed Columns

If your board has a column named **"v0.6.0"** or **"In Progress (Python)"** or similar,
drag those columns to **"Done"** or archive them. The Python/Electron era is closed.

---

## 2. Cards to Move → "Done"

These issues were closed as obsolete (Python/Docker/Electron — superseded by v0.7.0):

| Issue | Title | Move to |
|---|---|---|
| #201 | Native dependency strategy ADR | ✅ Done |
| #202 | IPC channel audit | ✅ Done |
| #204 | Integrate whisper.cpp sidecar | ✅ Done |
| #205 | Wire node-llama-cpp model download | ✅ Done |
| #216 | v0.6.0 release packaging | ✅ Done |

And all previously closed issues from the v0.6.0 milestone (17 closed) should already
appear in Done — verify they are not stuck in "Backlog" or "In Progress".

---

## 3. Cards to Move → "Backlog (v0.8.0)"

These 9 issues were carried from v0.6.0 and re-milestoned to v0.8.0. They are open.
Drag them into a **"v0.8.0 Backlog"** column (create if needed):

| Issue | Title |
|---|---|
| #203 | Web Audio API recording as primary mic capture |
| #206 | End-to-end recording flow — record → stop → save → library |
| #207 | Summarization pipeline — transcript → LLM → structured output → UI |
| #208 | Obsidian export with real recording data |
| #209 | Classification flow — auto-classify on stop + template badge |
| #210 | Search view — graceful degradation + RAG smoke test |
| #211 | Unit + E2E test coverage for recording and transcription pipelines |
| #213 | Settings UX — model management, API keys, language picker |
| #215 | Whisper inference benchmarks and memory profiling |

---

## 4. New Cards to Add → "v0.8.0 Backlog"

These 4 new issues were just created. They won't appear on the board automatically
unless you add them manually (or your board auto-adds new issues via workflow):

| Issue | Title | Priority |
|---|---|---|
| #221 | Production .app / .AppImage builds via `electrobun package` | 🔴 P0 |
| #222 | Obsidian plugin ↔ Electrobun IPC bridge | 🔴 P0 |
| #223 | Hardware-aware Whisper model selection | 🟡 P1 |
| #224 | In-app auto-updater | 🟡 P1 |

---

## 5. Recommended Column Structure for v0.8.0

If you're rebuilding the board from scratch, use this layout:

```
[ Backlog (v0.8.0) ] → [ In Progress ] → [ In Review ] → [ Done ]
```

Or with priority lanes:

```
Row: P0 — Packaging & IPC     →  #221, #222
Row: P1 — Quality & Features  →  #223, #224, #211, #215
Row: P2 — UI / UX             →  #203, #206, #207, #208, #209, #210, #213
```

---

## 6. Milestone Labels to Update

GitHub Projects can filter by milestone. Confirm the following:

| Milestone | Status | Issues |
|---|---|---|
| `v0.6.0 - Make It Real` (id: 8) | **CLOSED** ✅ | 17 closed, 0 open |
| `v0.7.0` | Not created (no separate milestone) | — |
| `v0.8.0 - Packaging & Obsidian Integration` (id: 9) | Open | 13 open |
| `v1.0.0 - Obsidian Community Plugin` (id: 4) | Open | 0 open (gated on #222) |

---

## 7. Board Description / README (Optional)

Update your Projects board description to:

> **VoiceVault — v0.8.0** | Pure Electrobun desktop app.
> Python / Docker / Electron stack retired in v0.7.0.
> This board tracks packaging, Obsidian integration, and hardware-aware model selection.

---

## What Was Done Automatically (CLI)

✅ Closed issues #201, #202, #204, #205, #216 with "superseded by v0.7.0" comment
✅ Moved issues #203, #206–#213, #215 from v0.6.0 → v0.8.0 milestone
✅ Stripped `[v0.6.0]` prefix from all 9 re-milestoned issue titles
✅ Closed `v0.6.0 - Make It Real` milestone
✅ Created `v0.8.0 - Packaging & Obsidian Integration` milestone (#9, due Apr 2026)
✅ Created issues #221, #222, #223, #224 (new v0.8.0 issues with full specs)
✅ Rewrote wiki: Home, Architecture, Getting-Started, Roadmap, _Sidebar, Development-Guide, Deployment, API-Reference
✅ Committed and pushed all wiki + doc changes to origin/main
