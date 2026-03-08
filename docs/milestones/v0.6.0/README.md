# v0.6.0 — "Make It Real" Milestone

**Target:** 4 weeks · 16 issues · 34 estimated person-days
**Theme:** Ship a working end-to-end voice recording → transcription → summarization → export pipeline.

---

## Scope

v0.6.0 transforms VoiceVault from a UI shell with stubbed services into a functional desktop app that records audio, transcribes on-device via Whisper, summarizes with a local LLM, and exports to Obsidian.

### Deliverables

| Area | What ships |
|------|-----------|
| **Recording** | Web Audio API mic capture with VAD, waveform visualization |
| **Transcription** | whisper-cpp sidecar process with CoreML acceleration (macOS) |
| **Summarization** | node-llama-cpp pipeline — 60s auto-summaries + hour integration |
| **Export** | Obsidian markdown with frontmatter, wikilinks, classification |
| **Search** | Graceful degradation UI (functional when embeddings are available) |
| **Quality** | Unit + E2E test coverage, security audit (CSP, IPC validation) |
| **Settings** | Model download UI, LLM/Whisper model selection |
| **Release** | v0.6.0 packaged builds (macOS DMG, Linux AppImage, Windows exe) |

### Definition of Done (Milestone)

1. All 16 issues closed and merged to `main`.
2. `pnpm dev` launches the app and completes a record → transcribe → summarize → export flow.
3. `pnpm test` passes with ≥60% line coverage on services.
4. `pnpm make` produces installable artifacts for macOS, Linux, and Windows.
5. No P0/P1 security findings from #214 remain open.

---

## 4-Week Phase Schedule

Refer to [docs/EXECUTION_PLAN_v0.6.0.md](../EXECUTION_PLAN_v0.6.0.md) for the full dependency graph and batch breakdown.

### Week 1 — Batch A (Foundation)

| Issue | Title | Est. |
|-------|-------|------|
| #200 | docs: Master plan, scope, context pack | 2d |
| #201 | docs: Native dependency strategy ADR | 2d |
| #202 | api-contract: IPC channel audit | 1d |
| #205 | plugin-core: node-llama-cpp model download + UI | 2d |

All four issues have **no dependencies** and run in parallel.

### Week 2 — Batch B (Core Plugins)

| Issue | Title | Est. | Depends on |
|-------|-------|------|-----------|
| #203 | plugin-core: Web Audio API recording | 3d | #201 |
| #204 | plugin-core: Whisper sidecar / whisper-node | 3d | #201 |
| #213 | frontend: Settings UX | 2d | #205 |
| #214 | security: IPC validation, CSP, permissions | 2d | #202 |

### Week 3 — Batch C+D (Integration)

| Issue | Title | Est. | Depends on |
|-------|-------|------|-----------|
| #206 | frontend: E2E recording flow | 3d | #203, #204 |
| #207 | plugin-core: Summarization pipeline | 2d | #206, #205 |
| #208 | vault-integration: Obsidian export | 2d | #206 |
| #210 | frontend: Search view graceful degradation | 2d | #206 |
| #212 | frontend: UX audit (empty states, i18n) | 2d | #206 |

#206 is the **hub node** — it unblocks 6 downstream issues.

### Week 4 — Batch E+F (Polish & Release)

| Issue | Title | Est. | Depends on |
|-------|-------|------|-----------|
| #209 | frontend: Classification flow | 2d | #207 |
| #211 | test: Unit + E2E coverage | 3d | #206, #207 |
| #215 | performance: Whisper + LLM benchmarks | 1d | #204, #207 |
| #216 | release: v0.6.0 bump + packaging | 1d | ALL |

### Critical Path

```
#201 (2d) → #203 (3d) → #206 (3d) → #207 (2d) → #211 (3d) → #216 (1d) = 14 days
```

---

## Out of Scope

The following are explicitly **not** part of v0.6.0:

- **Community plugin submission system** — no plugin marketplace or registry
- **Mobile app** — desktop only (Electron); no iOS/Android builds
- **Full backend rewrite** — we iterate on the existing Electron architecture, not replace it
- **Porting all features at once** — Phase 3+ features (diarization, system audio, translation) are deferred to v0.7.0+
- **Cloud-only mode** — all inference stays on-device; Claude API is an opt-in fallback, not a requirement

---

## References

- [Execution Plan](../EXECUTION_PLAN_v0.6.0.md) — full dependency graph, batch table, critical path analysis
- [Reference Links](./reference-links.md) — upstream repos and integration targets
- [Roadmap](../../wiki/Roadmap.md) — high-level timeline
- [Architecture](../../wiki/Architecture.md) — Electron IPC architecture diagram
