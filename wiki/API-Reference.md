# API Reference — HTTP RPC

VoiceVault's renderer communicates with the main process via HTTP RPC.
There is no REST API, no WebSocket server, and no FastAPI — those belonged
to the retired Python web stack.

---

## Transport

```
POST http://localhost:50100/rpc
Content-Type: application/json

{ "channel": "<domain>:<action>", "params": { ... } }
```

All calls are `POST`. The response is JSON. Errors return `{ "error": "<message>" }`.

In practice, you never call this directly — the renderer uses `window.api.*` methods
which are routed through `src/renderer/src/lib/electrobun-bridge.ts`.

---

## Channel Reference

### Audio — `audio:*`

| Channel | Params | Returns | Description |
|---|---|---|---|
| `audio:save-chunk` | `{ data: Uint8Array, recordingId: number }` | `{ ok: true }` | Persist an audio chunk to disk |
| `audio:get-file-path` | `{ recordingId: number }` | `{ path: string }` | Resolve the audio file path for a recording |
| `audio:delete` | `{ recordingId: number }` | `{ ok: true }` | Delete audio file from disk |

### Transcription — `whisper:*`

| Channel | Params | Returns | Description |
|---|---|---|---|
| `whisper:transcribe-file` | `{ filePath: string, language?: string }` | `{ segments: TranscriptSegment[] }` | Transcribe a WAV/WebM file via `whisper-cli` |
| `whisper:get-models` | `{}` | `{ models: string[] }` | List available Whisper models in `~/.voicevault/models/` |
| `whisper:download-model` | `{ size: string }` | `{ path: string }` | Download a Whisper model (streams progress) |

### LLM / Summarization — `llm:*`

| Channel | Params | Returns | Description |
|---|---|---|---|
| `llm:summarize` | `{ text: string, recordingId: number }` | `{ summary: string }` | Summarize a transcript segment |
| `llm:get-models` | `{}` | `{ models: string[] }` | List available GGUF models |
| `llm:download-model` | `{ name: string, url: string }` | `{ path: string }` | Download a GGUF model |
| `llm:stream-completion` | `{ prompt: string, modelPath: string }` | `ReadableStream<string>` | Streaming completion |

### Database — `db:*`

| Channel | Params | Returns | Description |
|---|---|---|---|
| `db:create-recording` | `{ title: string, startedAt: number }` | `{ id: number }` | Create a new recording row |
| `db:get-recording` | `{ id: number }` | `Recording \| null` | Fetch a recording by ID |
| `db:list-recordings` | `{ limit?: number, offset?: number }` | `Recording[]` | Paginated recording list |
| `db:update-recording` | `{ id: number, patch: Partial<Recording> }` | `{ ok: true }` | Update recording metadata |
| `db:delete-recording` | `{ id: number }` | `{ ok: true }` | Delete a recording and its segments |
| `db:insert-segment` | `{ recordingId: number, text: string, start: number, end: number }` | `{ id: number }` | Insert a transcript segment |
| `db:get-segments` | `{ recordingId: number }` | `TranscriptSegment[]` | Get all segments for a recording |

### Classification — `classify:*`

| Channel | Params | Returns | Description |
|---|---|---|---|
| `classify:run` | `{ recordingId: number, transcript: string }` | `{ category: string, confidence: number }` | Classify a recording |
| `classify:list-templates` | `{}` | `Template[]` | List available classification templates |
| `classify:apply-template` | `{ recordingId: number, templateId: string }` | `{ result: string }` | Apply a specific template |

### Export — `export:*`

| Channel | Params | Returns | Description |
|---|---|---|---|
| `export:to-obsidian` | `{ recordingId: number, vaultPath?: string }` | `{ filePath: string }` | Export recording as Obsidian Markdown |
| `export:preview` | `{ recordingId: number }` | `{ markdown: string }` | Preview the Markdown output |
| `export:list-templates` | `{}` | `{ templates: string[] }` | List export templates |

### RAG Search — `rag:*`

| Channel | Params | Returns | Description |
|---|---|---|---|
| `rag:search` | `{ query: string, limit?: number }` | `SearchResult[]` | Semantic search across recordings |
| `rag:index-recording` | `{ recordingId: number }` | `{ ok: true }` | Add recording to the vector index |

### Settings — `settings:*`

| Channel | Params | Returns | Description |
|---|---|---|---|
| `settings:get` | `{ key: string }` | `{ value: unknown }` | Get a setting value |
| `settings:set` | `{ key: string, value: unknown }` | `{ ok: true }` | Set a setting value |
| `settings:get-all` | `{}` | `Record<string, unknown>` | Dump all settings |

### System — `system:*`

| Channel | Params | Returns | Description |
|---|---|---|---|
| `system:get-version` | `{}` | `{ version: string }` | App version (from `shared/constants.ts`) |
| `system:get-audio-devices` | `{}` | `AudioDevice[]` | List available audio input devices |
| `system:set-audio-device` | `{ deviceId: string }` | `{ ok: true }` | Set active audio input device |

---

## Types

```typescript
interface TranscriptSegment {
  id: number
  recordingId: number
  text: string
  start: number   // seconds
  end: number     // seconds
}

interface Recording {
  id: number
  title: string
  startedAt: number    // Unix timestamp (ms)
  endedAt: number | null
  category: string | null
  summary: string | null
  filePath: string | null
}

interface SearchResult {
  recordingId: number
  segment: TranscriptSegment
  score: number
  snippet: string
}

interface Template {
  id: string
  name: string
  description: string
  fields: string[]
}
```

---

## Adding a New Channel

1. Add the constant to `src/shared/ipc-channels.ts`
2. Add `window.api.domain.method()` to `src/renderer/src/lib/electrobun-bridge.ts`
3. Implement the handler in `src/main/rpc/<domain>.ts`
4. Register in `src/main/rpc/index.ts`
5. Validate inputs with `src/main/utils/validate.ts`
