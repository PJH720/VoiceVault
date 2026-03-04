---
name: Plan 07 - RAG Search
overview: 녹음 전반을 대상으로 임베딩 생성, 벡터 검색, 재랭킹, 근거 기반 답변 생성까지 포함한 로컬 RAG 검색 시스템을 구축하기 위한 실행 플랜입니다.
todos:
  - id: embedding-service
    content: 로컬 임베딩 생성 파이프라인과 배치 처리 흐름을 구현한다.
    status: pending
  - id: vector-index
    content: 벡터 저장소와 유사도 검색 인덱스 전략을 구현한다.
    status: pending
  - id: rag-query-pipeline
    content: 질의-검색-재랭킹-답변 생성 파이프라인을 구성한다.
    status: pending
  - id: citation-answering
    content: timestamp/speaker/recording 근거를 포함한 응답 포맷을 구현한다.
    status: pending
  - id: search-ui-history
    content: 검색 화면, 결과 렌더링, 질의 히스토리 UX를 구현한다.
    status: pending
isProject: true
---

# Plan 07: RAG Search

**Phase:** 4 — RAG Search
**Priority:** P1 (High Value)
**Effort:** ~2 weeks
**Prerequisites:** Plan 02 (transcription), Plan 03 (database), Plan 04 (local LLM)

## Overview

Build a Retrieval-Augmented Generation (RAG) search system for natural language queries across all recordings. Generate sentence embeddings locally (MiniLM ONNX or via node-llama-cpp), store vectors in SQLite with FTS5 + custom index (or hnswlib-node for HNSW), perform semantic search with re-ranking, and generate grounded answers with citations (recording name, timestamp, speaker). Support cross-recording search and query history.

## Architecture

### Native Layer
- `src/main/services/EmbeddingService.ts` — generate embeddings locally
- `src/main/services/VectorService.ts` — vector storage and similarity search
- Embeddings stored as BLOBs in SQLite or in-memory HNSW index

### IPC Bridge
- `rag:query` — perform semantic search and generate answer
- `rag:embed-recordings` — background task to embed all recordings
- `rag:on-progress` — embedding progress events
- `search:history` — get recent searches
- `search:save` — save search query

### React Layer
- `src/renderer/components/Search/SearchView.tsx` — search input and results
- `src/renderer/components/Search/SearchResult.tsx` — result with citations
- `src/renderer/components/Search/QueryHistory.tsx` — recent searches

## Implementation Steps

### 1. Embedding Service (Main Process)
1. Install embedding model (options: local ONNX MiniLM or use node-llama-cpp)
2. Create `EmbeddingService` wrapping embedding generation
3. Support batch embedding for efficiency
4. Normalize embeddings (unit vectors for cosine similarity)

```typescript
// src/main/services/EmbeddingService.ts
import { LlamaModel, LlamaContext } from 'node-llama-cpp';
import { app } from 'electron';
import path from 'path';

export class EmbeddingService {
  private model: LlamaModel | null = null;
  private context: LlamaContext | null = null;
  private modelPath: string;

  constructor(modelName = 'nomic-embed-text-v1.5-Q8_0') {
    this.modelPath = path.join(app.getPath('userData'), 'models', 'embeddings', `${modelName}.gguf`);
  }

  async initialize(): Promise<void> {
    if (!await this.isModelAvailable()) {
      throw new Error('Embedding model not found. Download required.');
    }

    this.model = new LlamaModel({
      modelPath: this.modelPath,
      gpuLayers: process.platform === 'darwin' ? 'max' : 0,
    });

    this.context = new LlamaContext({
      model: this.model,
      contextSize: 512,
      embedding: true,
    });
  }

  async embed(text: string): Promise<Float32Array> {
    if (!this.context) await this.initialize();

    const embedding = await this.context!.getEmbedding(text);
    return this.normalize(embedding);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const embeddings = await Promise.all(texts.map(t => this.embed(t)));
    return embeddings;
  }

  private normalize(vec: Float32Array): Float32Array {
    let norm = 0;
    for (let i = 0; i < vec.length; i++) {
      norm += vec[i] * vec[i];
    }
    norm = Math.sqrt(norm);

    const normalized = new Float32Array(vec.length);
    for (let i = 0; i < vec.length; i++) {
      normalized[i] = vec[i] / norm;
    }
    return normalized;
  }

  async isModelAvailable(): Promise<boolean> {
    const fs = await import('fs/promises');
    try {
      await fs.access(this.modelPath);
      return true;
    } catch {
      return false;
    }
  }

  destroy(): void {
    this.context?.dispose();
    this.context = null;
    this.model?.dispose();
    this.model = null;
  }
}
```

### 2. Vector Service (Main Process)
1. Create `VectorService` for storing and searching embeddings
2. Use SQLite BLOB storage + brute-force cosine similarity (fast enough for <10K vectors)
3. Optional: Use `hnswlib-node` for HNSW index if performance needed

```typescript
// src/main/services/VectorService.ts
import type { Database } from 'better-sqlite3';

export interface VectorDocument {
  id: number;
  recordingId: number;
  segmentId?: number;
  text: string;
  embedding: Float32Array;
  metadata: {
    recordingTitle: string;
    timestamp?: number;
    speaker?: string;
  };
}

export interface SearchResult {
  document: VectorDocument;
  similarity: number;
}

export class VectorService {
  constructor(private db: Database) {}

  insertVector(doc: Omit<VectorDocument, 'id'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO vector_documents (recording_id, segment_id, text, embedding, metadata)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      doc.recordingId,
      doc.segmentId || null,
      doc.text,
      this.serializeEmbedding(doc.embedding),
      JSON.stringify(doc.metadata)
    );

    return result.lastInsertRowid as number;
  }

  search(queryEmbedding: Float32Array, limit = 10): SearchResult[] {
    // Brute-force cosine similarity search
    const rows = this.db.prepare(`
      SELECT id, recording_id as recordingId, segment_id as segmentId,
             text, embedding, metadata
      FROM vector_documents
    `).all() as any[];

    const results = rows.map(row => {
      const docEmbedding = this.deserializeEmbedding(row.embedding);
      const similarity = this.cosineSimilarity(queryEmbedding, docEmbedding);

      return {
        document: {
          id: row.id,
          recordingId: row.recordingId,
          segmentId: row.segmentId,
          text: row.text,
          embedding: docEmbedding,
          metadata: JSON.parse(row.metadata),
        },
        similarity,
      };
    });

    // Sort by similarity descending, take top N
    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  deleteByRecording(recordingId: number): void {
    this.db.prepare('DELETE FROM vector_documents WHERE recording_id = ?').run(recordingId);
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    // Assume vectors are already normalized
    let dotProduct = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
    }
    return dotProduct;
  }

  private serializeEmbedding(embedding: Float32Array): Buffer {
    return Buffer.from(embedding.buffer);
  }

  private deserializeEmbedding(buffer: Buffer): Float32Array {
    return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  }
}
```

### 3. RAG Query Service (Main Process)
1. Combine embedding search + LLM generation
2. Build context from top-k retrieved segments
3. Generate answer with citations

```typescript
// src/main/services/RAGService.ts
import { EmbeddingService } from './EmbeddingService';
import { VectorService } from './VectorService';
import { LLMService } from './LLMService';

export interface RAGAnswer {
  answer: string;
  sources: Array<{
    recordingId: number;
    recordingTitle: string;
    timestamp?: number;
    speaker?: string;
    text: string;
    relevance: number;
  }>;
}

export class RAGService {
  constructor(
    private embeddingService: EmbeddingService,
    private vectorService: VectorService,
    private llmService: LLMService
  ) {}

  async query(question: string, topK = 5): Promise<RAGAnswer> {
    // 1. Embed query
    const queryEmbedding = await this.embeddingService.embed(question);

    // 2. Retrieve top-k similar segments
    const results = this.vectorService.search(queryEmbedding, topK);

    // 3. Build context from retrieved segments
    const context = results.map((r, idx) => {
      const citation = `[${idx + 1}] ${r.document.metadata.recordingTitle}${
        r.document.metadata.timestamp !== undefined
          ? ` (${this.formatTimestamp(r.document.metadata.timestamp)})`
          : ''
      }${r.document.metadata.speaker ? ` - ${r.document.metadata.speaker}` : ''}\n${r.document.text}`;
      return citation;
    }).join('\n\n');

    // 4. Generate answer with LLM
    const prompt = `Answer the following question based ONLY on the provided context. Include citation numbers [1], [2], etc. when referencing sources.

Question: ${question}

Context:
${context}

Answer:`;

    let answer = '';
    await this.llmService.summarize(prompt, (token) => {
      answer += token;
    });

    // 5. Extract sources
    const sources = results.map(r => ({
      recordingId: r.document.recordingId,
      recordingTitle: r.document.metadata.recordingTitle,
      timestamp: r.document.metadata.timestamp,
      speaker: r.document.metadata.speaker,
      text: r.document.text,
      relevance: r.similarity,
    }));

    return { answer, sources };
  }

  private formatTimestamp(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
```

### 4. Background Embedding Task (Main Process)
1. Embed all transcript segments when recording finishes
2. Show progress bar in UI
3. Support incremental embedding (only new recordings)

```typescript
// Add to DatabaseService or create BackgroundTaskService
async embedAllRecordings(
  onProgress: (current: number, total: number) => void
): Promise<void> {
  const recordings = this.db.prepare(`
    SELECT r.id, r.title, ts.id as segmentId, ts.text, ts.start_time, ts.end_time
    FROM recordings r
    JOIN transcript_segments ts ON ts.recording_id = r.id
    WHERE NOT EXISTS (
      SELECT 1 FROM vector_documents WHERE segment_id = ts.id
    )
  `).all() as any[];

  const total = recordings.length;

  for (let i = 0; i < recordings.length; i++) {
    const rec = recordings[i];
    const embedding = await embeddingService.embed(rec.text);

    vectorService.insertVector({
      recordingId: rec.id,
      segmentId: rec.segmentId,
      text: rec.text,
      embedding,
      metadata: {
        recordingTitle: rec.title,
        timestamp: rec.start_time,
      },
    });

    onProgress(i + 1, total);
  }
}
```

### 5. Database Schema Extension
```sql
-- Migration: 006_rag.sql
CREATE TABLE IF NOT EXISTS vector_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recording_id INTEGER NOT NULL,
  segment_id INTEGER,                    -- NULL for whole-recording embeddings
  text TEXT NOT NULL,
  embedding BLOB NOT NULL,               -- serialized Float32Array
  metadata TEXT,                         -- JSON: {recordingTitle, timestamp, speaker}
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE,
  FOREIGN KEY (segment_id) REFERENCES transcript_segments(id) ON DELETE CASCADE
);

CREATE INDEX idx_vectors_recording ON vector_documents(recording_id);
CREATE INDEX idx_vectors_segment ON vector_documents(segment_id);

CREATE TABLE IF NOT EXISTS search_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  result_count INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_search_history_created ON search_history(created_at DESC);
```

### 6. IPC Handlers (Main Process)
```typescript
// src/main/ipc/rag.ts
import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron';
import { RAGService } from '../services/RAGService';
import { EmbeddingService } from '../services/EmbeddingService';
import { VectorService } from '../services/VectorService';
import { LLMService } from '../services/LLMService';
import { db } from '../services/DatabaseService';

let ragService: RAGService;

export function registerRAGHandlers(mainWindow: BrowserWindow): void {
  const embeddingService = new EmbeddingService();
  const vectorService = new VectorService(db);
  const llmService = new LLMService();

  ragService = new RAGService(embeddingService, vectorService, llmService);

  ipcMain.handle('rag:query', async (event, question: string, topK?: number) => {
    const answer = await ragService.query(question, topK);

    // Save to search history
    db.prepare(`
      INSERT INTO search_history (query, result_count) VALUES (?, ?)
    `).run(question, answer.sources.length);

    return answer;
  });

  ipcMain.handle('rag:embed-recordings', async (event) => {
    await embedAllRecordings((current, total) => {
      event.sender.send('rag:on-progress', { current, total });
    });
    return { success: true };
  });

  ipcMain.handle('search:history', async () => {
    return db.prepare(`
      SELECT query, result_count as resultCount, created_at as createdAt
      FROM search_history
      ORDER BY created_at DESC
      LIMIT 20
    `).all();
  });
}
```

### 7. UI Components (Renderer)
```typescript
// src/renderer/components/Search/SearchView.tsx
import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function SearchView() {
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsSearching(true);
    try {
      const result = await window.api.rag.query(query);
      setAnswer(result);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Ask anything about your recordings..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-10"
            />
          </div>
          <Button onClick={handleSearch} disabled={isSearching || !query.trim()}>
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {answer && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Answer</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {answer.answer}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Sources</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {answer.sources.map((source: any, idx: number) => (
                  <div key={idx} className="border-l-2 border-primary pl-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">[{idx + 1}]</Badge>
                      <span className="font-semibold text-sm">{source.recordingTitle}</span>
                      {source.timestamp !== undefined && (
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(source.timestamp)}
                        </span>
                      )}
                      {source.speaker && (
                        <Badge variant="secondary">{source.speaker}</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{source.text}</p>
                    <div className="text-xs text-muted-foreground">
                      Relevance: {(source.relevance * 100).toFixed(1)}%
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}

        {!answer && !isSearching && (
          <div className="text-center py-12 text-muted-foreground">
            Ask a question to search across all your recordings
          </div>
        )}
      </div>
    </div>
  );
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
```

## New Files

```
src/
├── main/
│   ├── services/
│   │   ├── EmbeddingService.ts
│   │   ├── VectorService.ts
│   │   └── RAGService.ts
│   ├── ipc/
│   │   └── rag.ts
│   └── migrations/
│       └── 006_rag.sql
└── renderer/
    └── components/
        └── Search/
            ├── SearchView.tsx
            ├── SearchResult.tsx
            └── QueryHistory.tsx
```

## Testing Strategy

### Unit Tests
- `VectorService.test.ts` — test cosine similarity, top-k retrieval
- `RAGService.test.ts` — test context building, citation extraction

### E2E Tests
- Embed 10 recordings → search for keyword → verify relevant results
- Ask question → verify answer contains citations
- Test cross-recording search

## Acceptance Criteria

- [ ] Embedding model downloads on first search
- [ ] All transcript segments embedded on recording finish
- [ ] Search returns relevant results with similarity scores
- [ ] Answer generated with citations [1], [2], etc.
- [ ] Citations link to recording + timestamp
- [ ] Clicking citation opens recording detail and seeks to timestamp
- [ ] Search history saved and displayed
- [ ] Cross-recording search works (finds info across multiple recordings)
- [ ] Embedding progress shown in Settings
- [ ] Fast search (<1s for 100 recordings)
- [ ] Graceful degradation if embedding model not available

## Edge Cases & Gotchas

- **Cold start:** First embedding run may take 10+ min for 100 recordings
- **Vector index size:** 10K segments × 768-dim embeddings = ~30 MB in SQLite
- **Hallucinations:** LLM may invent facts — citations help verify answers
- **Irrelevant results:** Low similarity threshold → no results; high threshold → irrelevant results (tune to 0.6-0.7)
- **Long contexts:** LLM context window limit — truncate or summarize retrieved segments if >8K tokens
- **Re-ranking:** Simple cosine similarity may not be optimal — consider BM25 hybrid or cross-encoder re-ranking

## Performance Targets

| Metric | Target |
|--------|--------|
| **Embedding speed** | ~10 segments/second (batch) |
| **Search latency** | <500ms for 10K vectors (brute-force cosine) |
| **Answer generation** | <10s for typical query |
| **Embedding storage** | <50 MB for 1000 recordings |
