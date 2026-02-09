# Data Schema & Pipeline

VoiceVault의 데이터베이스 스키마, 데이터 모델, 처리 파이프라인 상세 문서입니다.

---

## 데이터베이스 스키마 (SQLite + ChromaDB)

### ERD 개요

```
┌──────────────┐     ┌──────────────┐     ┌────────────────┐
│  recordings  │────<│  transcripts │     │  templates     │
│──────────────│     │──────────────│     │────────────────│
│ id (PK)      │     │ id (PK)      │     │ id (PK)        │
│ started_at   │     │ recording_id │     │ name           │
│ ended_at     │     │ minute_index │     │ triggers (JSON)│
│ audio_path   │     │ text         │     │ output_format  │
│ status       │     │ confidence   │     │ fields (JSON)  │
│ total_minutes│     │ created_at   │     │ priority       │
└──────┬───────┘     └──────────────┘     └────────┬───────┘
       │                                           │
       │             ┌──────────────┐              │
       ├────────────<│  summaries   │              │
       │             │──────────────│              │
       │             │ id (PK)      │              │
       │             │ recording_id │              │
       │             │ minute_index │              │
       │             │ summary_text │              │
       │             │ keywords     │              │
       │             │ speakers     │              │
       │             │ confidence   │              │
       │             │ created_at   │              │
       │             └──────────────┘              │
       │                                           │
       │             ┌────────────────┐            │
       ├────────────<│ hour_summaries │            │
       │             │────────────────│            │
       │             │ id (PK)        │            │
       │             │ recording_id   │            │
       │             │ hour_index     │            │
       │             │ summary_text   │            │
       │             │ token_count    │            │
       │             │ created_at     │            │
       │             └────────────────┘            │
       │                                           │
       │             ┌──────────────────┐          │
       └────────────<│ classifications  │>─────────┘
                     │──────────────────│
                     │ id (PK)          │
                     │ recording_id     │
                     │ template_id      │
                     │ start_minute     │
                     │ end_minute       │
                     │ confidence       │
                     │ result_json      │
                     │ export_path      │
                     │ created_at       │
                     └──────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  ChromaDB (Vector Store)         │  rag_queries (SQLite)     │
│  ────────────────────────        │  ─────────────────────    │
│  Collection:                     │  id (PK)                  │
│    voicevault_summaries          │  query_text               │
│  ├─ id (summary-{rec}-{min})     │  answer_text              │
│  ├─ document (summary_text)      │  sources (JSON)           │
│  ├─ embedding (384-dim vec)      │  model_used               │
│  └─ metadata                     │  created_at               │
│     (recording_id, category,     │                           │
│      keywords, date, ...)        │                           │
└──────────────────────────────────────────────────────────────┘
```

---

### 테이블 상세

#### `recordings` - 녹음 세션

```sql
CREATE TABLE recordings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at      DATETIME NOT NULL,
    ended_at        DATETIME,
    audio_path      TEXT,                           -- 오디오 파일 경로
    status          TEXT DEFAULT 'recording',       -- recording | processing | completed | failed
    total_minutes   INTEGER DEFAULT 0,
    metadata_json   TEXT,                           -- 추가 메타데이터 (JSON)
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recordings_status ON recordings(status);
CREATE INDEX idx_recordings_started ON recordings(started_at);
```

#### `transcripts` - 전사 텍스트

```sql
CREATE TABLE transcripts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    recording_id    INTEGER NOT NULL REFERENCES recordings(id),
    minute_index    INTEGER NOT NULL,               -- 0-based (0 = 첫 1분)
    text            TEXT NOT NULL,
    confidence      REAL DEFAULT 0.0,               -- Whisper 신뢰도 (0-1)
    language        TEXT DEFAULT 'auto',
    word_count      INTEGER DEFAULT 0,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transcripts_recording ON transcripts(recording_id);
CREATE INDEX idx_transcripts_minute ON transcripts(recording_id, minute_index);
```

#### `summaries` - 1분 단위 요약

```sql
CREATE TABLE summaries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    recording_id    INTEGER NOT NULL REFERENCES recordings(id),
    minute_index    INTEGER NOT NULL,
    summary_text    TEXT NOT NULL,
    keywords        TEXT,                           -- JSON array ["AI", "RAG"]
    speakers        TEXT,                           -- JSON array ["User", "Sarah"]
    confidence      REAL DEFAULT 0.0,
    model_used      TEXT,                           -- "claude-3.5-sonnet" / "llama3.2"
    token_count     INTEGER DEFAULT 0,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_summaries_recording ON summaries(recording_id);
CREATE INDEX idx_summaries_minute ON summaries(recording_id, minute_index);
```

#### `hour_summaries` - 1시간 통합 요약

```sql
CREATE TABLE hour_summaries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    recording_id    INTEGER NOT NULL REFERENCES recordings(id),
    hour_index      INTEGER NOT NULL,               -- 0-based (0 = 첫 1시간)
    summary_text    TEXT NOT NULL,
    keywords        TEXT,                           -- JSON array
    topic_segments  TEXT,                           -- JSON: [{start, end, topic}]
    token_count     INTEGER DEFAULT 0,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_hour_summaries_recording ON hour_summaries(recording_id);
```

#### `classifications` - 분류 결과

```sql
CREATE TABLE classifications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    recording_id    INTEGER NOT NULL REFERENCES recordings(id),
    template_id     INTEGER REFERENCES templates(id),
    template_name   TEXT NOT NULL,
    start_minute    INTEGER NOT NULL,               -- 시작 분
    end_minute      INTEGER NOT NULL,               -- 종료 분
    confidence      REAL DEFAULT 0.0,
    result_json     TEXT,                           -- 분류 결과 상세 (JSON)
    export_path     TEXT,                           -- 내보낸 MD 파일 경로
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_classifications_recording ON classifications(recording_id);
CREATE INDEX idx_classifications_template ON classifications(template_name);
```

#### `templates` - 사용자 정의 템플릿

```sql
CREATE TABLE templates (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL UNIQUE,            -- "lecture_note"
    display_name    TEXT NOT NULL,                   -- "강의 노트"
    description     TEXT,
    triggers        TEXT NOT NULL,                   -- JSON array ["교수", "강의", "과목"]
    output_format   TEXT NOT NULL,                   -- Markdown 템플릿 (변수 포함)
    fields          TEXT,                           -- JSON: 추출할 필드 정의
    icon            TEXT DEFAULT '📝',
    priority        INTEGER DEFAULT 50,              -- 높을수록 우선 매칭
    is_default      BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_templates_name ON templates(name);
```

#### `rag_queries` - RAG 검색 이력

```sql
CREATE TABLE rag_queries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    query_text      TEXT NOT NULL,                     -- 사용자 자연어 쿼리
    results_json    TEXT,                              -- 검색 결과 (JSON)
    model_used      TEXT,                              -- 사용된 LLM 모델
    answer_text     TEXT,                              -- LLM 생성 답변
    sources         TEXT,                              -- JSON: [{recording_id, minute_index, similarity}]
    top_k           INTEGER DEFAULT 5,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

### ChromaDB 벡터 스토어 스키마

SQLite와 별도로, 벡터 임베딩은 ChromaDB에 저장됩니다.

```
Collection: voicevault_summaries
├── id: "summary-{recording_id}-{minute_index}"
├── document: summary_text (plain text)
├── embedding: 384-dim vector (MiniLM / nomic-embed-text)
└── metadata:
    ├── recording_id: int        # FK → recordings.id
    ├── minute_index: int        # 0-based minute within recording
    ├── category: str            # lecture / meeting / personal / ...
    ├── keywords: str            # comma-separated keywords
    ├── speakers: str            # comma-separated speaker names
    ├── confidence: float        # summary confidence (0-1)
    ├── date: str                # ISO 8601 (e.g., "2026-02-10")
    └── hour_index: int          # which hour of the recording
```

**인덱스**: ChromaDB는 자동으로 HNSW (Hierarchical Navigable Small World) 인덱스를 생성합니다.

**Distance Metric**: Cosine similarity (값이 작을수록 유사)

**저장 경로**: `data/chroma_db/` (persistent SQLite backend)

---

## Pydantic 데이터 모델

### 핵심 모델

```python
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum

class RecordingStatus(str, Enum):
    RECORDING = "recording"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class SummaryResult(BaseModel):
    """1분 요약 결과"""
    minute_index: int
    summary_text: str
    keywords: list[str] = Field(default_factory=list)
    speakers: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)

class ClassificationResult(BaseModel):
    """자동 분류 결과"""
    template_name: str
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str                                   # LLM이 설명한 분류 이유
    segments: list["ClassificationSegment"]

class ClassificationSegment(BaseModel):
    """분류된 구간"""
    start_minute: int
    end_minute: int
    template_name: str
    confidence: float
    keywords: list[str] = Field(default_factory=list)

class RAGQuery(BaseModel):
    """RAG 검색 요청"""
    query: str                                       # 자연어 쿼리
    top_k: int = Field(default=5, ge=1, le=20)
    min_similarity: float = Field(default=0.3, ge=0.0, le=1.0)
    filters: dict | None = None                      # 메타데이터 필터 (date, category 등)

class RAGResult(BaseModel):
    """RAG 검색 결과"""
    answer: str                                      # LLM 생성 답변
    sources: list["RAGSource"]
    model_used: str
    query_time_ms: int

class RAGSource(BaseModel):
    """RAG 결과 출처"""
    recording_id: int
    minute_index: int
    summary_text: str
    similarity: float
    date: str
    category: str | None = None

class ObsidianFrontmatter(BaseModel):
    """Obsidian YAML Frontmatter"""
    title: str
    date: str                                        # ISO 8601
    type: str                                        # lecture_note / meeting / conversation / memo
    category: str
    duration: str | None = None
    tags: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    speakers: list[str] = Field(default_factory=list)
    recording_id: str
    confidence: float

class ExportRequest(BaseModel):
    """내보내기 요청"""
    recording_id: int
    classification_id: int | None = None             # 특정 분류만 내보내기
    include_transcript: bool = False                  # 원본 전사 포함 여부
    format: str = "obsidian"                         # obsidian | markdown | json | txt
    obsidian_vault_path: str | None = None           # Obsidian vault 직접 내보내기
```

---

## 토큰 최적화 전략

### 계층적 요약 피라미드

```
원본 전사 (1시간)
~12,000 tokens
      ↓ (1분 단위 LLM 요약)
Level 1: 60개 × 1분 요약
~9,000 tokens (25% 절감)
      ↓ (10분 단위 통합)
Level 2: 6개 × 10분 요약
~1,800 tokens (80% 절감)
      ↓ (1시간 통합)
Level 3: 1개 × 1시간 요약
~600 tokens (95% 절감)
```

### 비용 임팩트

| 시나리오 | 미최적화 | 계층적 요약 | 절감 |
|---------|---------|-----------|------|
| 1시간 × 5회/주 × 4주 | ~$120 | ~$25-30 | **75%** |
| 14시간 하루 녹음 | ~$5.60 | ~$0.23 | **96%** |

---

## 관련 문서

- [Architecture](Architecture) - 시스템 전체 구조
- [API Reference](API-Reference) - 엔드포인트 상세
- [Template System](Template-System) - 분류 템플릿 설계
