# Changelog

## [0.5.0] — 2026-03-05

### Features
- **OpenAI & Gemini LLM providers** — GPT-4o, GPT-4o-mini, Gemini 2.5 Flash/Pro alongside existing Ollama & Claude (#171)
- **Client-side routing** — HashRouter with react-router-dom, persistent recording across navigation (#179)
- **Content Security Policy** — CSP headers via session.webRequest to block eval/inline/remote scripts (#181)
- **Singleton ServiceRegistry** — lazy-creating service cache preventing duplicate model loads (~3 GB savings) (#178)
- **VectorService performance** — adaptive chunked search, early-exit cosine similarity, prepared statements (#177)
- **electron-store schema validation** — versioned schema with migration support (#186)
- **Graceful shutdown** — registered service destroy callbacks with 5s timeout (#175)
- **i18n expansion** — model names, playback speeds, error messages in en/ko/ja (#182)

### Bug Fixes
- Remove phantom native dependencies (sharp, fluent-ffmpeg, node-vad) with graceful fallbacks (#172)
- Add ErrorBoundary component wrapping each page (#173)
- Fix ALTER TABLE migration running outside transaction wrappers (#174)
- Fix RecordingContext useMemo missing dependencies (#176)
- Fix FTS5 MATCH injection via double-quote escaping (#180)
- Update CloudModelName type to current Anthropic model identifiers (#183)
- Fix AudioCapture fallback — clear chunkListeners, expose capture mode to renderer (#184)
- Resolve act() warnings and slow timer in tests (#185)

### Infrastructure
- CI workflow rewritten for flat Electron project structure
