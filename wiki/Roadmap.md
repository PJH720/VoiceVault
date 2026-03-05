# Roadmap — v0.6.0

4-week sprint plan for the v0.6.0 milestone.

## Week 1 — Batch A: Foundation

| Issue | Title |
|-------|-------|
| #200 | Documentation & milestone tracking |
| #201 | Architecture Decision Records (ADR) |
| #202 | IPC channel audit & type safety |
| #205 | Local LLM setup (node-llama-cpp) |

**Goal:** Docs, architecture decisions, IPC hardening, LLM infrastructure.

## Week 2 — Batch B: Core Audio + Whisper

| Issue | Title |
|-------|-------|
| #203 | Audio capture (native-audio-node) |
| #204 | Whisper transcription (whisper-cpp-node) |
| #213 | Settings & preferences UI |
| #214 | Security audit & hardening |

**Goal:** Working mic capture → transcription pipeline. Settings UI. Security review.

## Week 3 — Batch C+D: Features

| Issue | Title |
|-------|-------|
| #206 | Recording flow (start/stop/pause) |
| #207 | LLM summarization pipeline |
| #208 | Obsidian export |
| #210 | RAG search |
| #212 | UX polish & accessibility |

**Goal:** End-to-end recording → summarization → export flow. Search. UX pass.

## Week 4 — Batch E+F: Quality & Release

| Issue | Title |
|-------|-------|
| #209 | Zero-shot classification |
| #211 | Test coverage (unit + E2E) |
| #215 | Performance profiling & optimization |
| #216 | Release packaging & distribution |

**Goal:** Classification, comprehensive tests, perf tuning, ship v0.6.0.
