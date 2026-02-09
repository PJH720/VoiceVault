# Architecture

VoiceVault의 시스템 아키텍처 전체 설계 문서입니다.

---

## 설계 원칙

| 원칙 | 설명 |
|------|------|
| **Local-First** | 외부 서비스 없이 완전 동작. 클라우드는 선택사항 |
| **Provider Agnostic** | LLM/STT/Embedding 제공자를 인터페이스로 추상화. 자유 교체 |
| **Modular Pipeline** | 각 처리 단계가 독립적. 단계 실패가 전체를 차단하지 않음 |
| **Service Layer Pattern** | UI → API → Service → Storage 분리. 관심사 격리 |
| **Event-Driven** | 파이프라인 단계 간 이벤트 기반 통신 |
| **RAG-Powered** | 모든 요약은 벡터 임베딩으로 저장 → 자연어 검색 가능 |
| **PKM-Compatible** | Obsidian 호환 Markdown 내보내기 (frontmatter, wikilinks, tags) |

---

## 시스템 레이어 구조

```
┌───────────────────────────────────────────────────────────┐
│                  PRESENTATION LAYER                        │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              Streamlit UI (Frontend)                 │  │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────────────┐ │  │
│  │  │ Recording│  │ Summary  │  │  Classification   │ │  │
│  │  │ Page     │  │ Page     │  │  Page             │ │  │
│  │  └──────────┘  └──────────┘  └───────────────────┘ │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────┬────────────────────────────────┘
                           │ HTTP / WebSocket
┌──────────────────────────▼────────────────────────────────┐
│                     API LAYER                              │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              FastAPI Backend                         │  │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────────────┐ │  │
│  │  │WebSocket │  │  REST    │  │   Middleware       │ │  │
│  │  │Handlers  │  │  Routes  │  │   (Auth, Error)    │ │  │
│  │  └──────────┘  └──────────┘  └───────────────────┘ │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────┬────────────────────────────────┘
                           │ Function Calls
┌──────────────────────────▼────────────────────────────────┐
│                   SERVICE LAYER                            │
│                                                            │
│  ┌──────────┐ ┌────────────┐ ┌───────────┐ ┌──────────┐  │
│  │  Audio   │ │Transcription│ │Summarizer │ │Classifier│  │
│  │  Service │ │  Service   │ │  Service  │ │ Service  │  │
│  └─────┬────┘ └──────┬─────┘ └─────┬─────┘ └────┬─────┘  │
│        │             │              │             │        │
│  ┌─────▼─────────────▼──────────────▼─────────────▼─────┐ │
│  │              LLM Provider Abstraction                 │ │
│  │  ┌──────────────┐  ┌───────────────┐                 │ │
│  │  │  Claude LLM  │  │  Ollama LLM   │                 │ │
│  │  └──────────────┘  └───────────────┘                 │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌──────────┐ ┌──────────┐ ┌───────────────────────────┐ │
│  │   RAG    │ │  Export   │ │  Template Matcher         │ │
│  │ Service  │ │ Service   │ │  Service                  │ │
│  │(Retriever│ │(Obsidian) │ │                           │ │
│  │+Embedder)│ │           │ │                           │ │
│  └─────┬────┘ └──────────┘ └───────────────────────────┘ │
│        │                                                   │
│  ┌─────▼────────────────────────────────────────────────┐ │
│  │           Embedding Provider Abstraction              │ │
│  │  ┌────────────────────┐  ┌─────────────────────┐     │ │
│  │  │ SentenceTransformer│  │  Ollama Embeddings  │     │ │
│  │  │ (all-MiniLM-L6-v2)│  │  (nomic-embed-text) │     │ │
│  │  └────────────────────┘  └─────────────────────┘     │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌──────────┐                                              │
│  │ Storage  │                                              │
│  │ Service  │                                              │
│  └──────────┘                                              │
└──────────────────────────┬────────────────────────────────┘
                           │ ORM / File I/O / Vector I/O
┌──────────────────────────▼────────────────────────────────┐
│                   DATA LAYER                               │
│  ┌──────────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │  SQLite Database  │  │  ChromaDB    │  │ File System │ │
│  │  (SQLAlchemy ORM) │  │  (Vector DB) │  │ recordings/ │ │
│  │  metadata + CRUD  │  │  embeddings  │  │ exports/    │ │
│  └──────────────────┘  └──────────────┘  └─────────────┘ │
└───────────────────────────────────────────────────────────┘
```

---

## 핵심 데이터 파이프라인

### 전체 처리 흐름

```
[Phase 1: Real-time]              [Phase 2: Post-processing]        [Phase 3: RAG & Export]

 User → Microphone                 Recording Stop                    User Query (자연어)
   ↓                                  ↓                                  ↓
 Audio Chunks (PCM)                Collect all 1-min summaries       Embed query → ChromaDB
   ↓                                  ↓                                  ↓
 WebSocket → FastAPI               Hour Integration                  Similarity search (Top-K)
   ↓                               (60 summaries → 1 document)          ↓
 Whisper STT                          ↓                              Re-rank + metadata filter
   ↓                               Zero-shot Classification              ↓
 Real-time Transcript              (Claude/Ollama)                   LLM answer with citations
   ↓                                  ↓                                  ↓
 Every 60s → LLM Summarize        Template Matching                  Grounded response + sources
   ↓                               (사용자 정의 규칙)
 1-min Summary → SQLite               ↓
   ↓                               Obsidian Markdown Export
 Embed summary → ChromaDB         (frontmatter + wikilinks)
   ↓
 UI Update (live)
```

### Pipeline A: 녹음 & 전사 (실시간)

```
User clicks "Record"
    ↓
┌──────────────────────────────────┐
│ Web Audio API                    │
│ ├─ getUserMedia() → MediaStream  │
│ ├─ AudioContext → PCM chunks     │
│ └─ chunk size: 512 samples       │
└──────────────┬───────────────────┘
               ↓
┌──────────────────────────────────┐
│ WebSocket Transport              │
│ ├─ Client → Server: audio bytes  │
│ └─ Server → Client: transcript   │
└──────────────┬───────────────────┘
               ↓
┌──────────────────────────────────┐
│ Whisper STT Service              │
│ ├─ Input: audio chunk (bytes)    │
│ ├─ Model: base / turbo / large   │
│ └─ Output: {text, confidence,    │
│             timestamps}           │
└──────────────┬───────────────────┘
               ↓
         UI: Live transcript
         DB: Save transcript row
```

### Pipeline B: 1분 요약 (자동 트리거)

```
Every 60 seconds (timer trigger)
    ↓
┌──────────────────────────────────┐
│ Collect last 60s transcript      │
│ + Previous context (500 tokens)  │
└──────────────┬───────────────────┘
               ↓
┌──────────────────────────────────┐
│ LLM Summarization                │
│                                  │
│ System: "You are an expert       │
│  summarizer. Extract key points. │
│  Output JSON."                   │
│                                  │
│ Output:                          │
│ {                                │
│   "summary": "...",              │
│   "keywords": ["AI", "RAG"],     │
│   "speakers": ["User", "Sarah"], │
│   "confidence": 0.92             │
│ }                                │
└──────────────┬───────────────────┘
               ↓
         DB: Save to summaries table
         Embed: summary → ChromaDB (async)
         UI: Update summary list
```

### Pipeline C: RAG 검색 (사용자 쿼리)

```
User enters natural language query
    ↓
┌──────────────────────────────────┐
│ Embed Query                      │
│ ├─ Input: "LangChain에 대해 뭐?" │
│ ├─ Model: MiniLM / nomic-embed   │
│ └─ Output: 384-dim vector         │
└──────────────┬───────────────────┘
               ↓
┌──────────────────────────────────┐
│ ChromaDB Similarity Search       │
│ ├─ Distance: cosine              │
│ ├─ Top-K: 5 (configurable)      │
│ └─ Metadata filter (date, type)  │
└──────────────┬───────────────────┘
               ↓
┌──────────────────────────────────┐
│ LLM Grounded Answer              │
│ ├─ Input: query + retrieved docs │
│ ├─ System: "Answer based on the  │
│ │   provided context only.       │
│ │   Cite sources."               │
│ └─ Output: answer + source refs  │
└──────────────┬───────────────────┘
               ↓
         UI: Display answer + sources
         Each source links to recording
```

### Pipeline D: 자동 분류 (녹음 종료 시)

```
Recording stopped → Trigger classification
    ↓
┌──────────────────────────────────┐
│ Collect all hour_summaries       │
│ (or all 1-min summaries)         │
└──────────────┬───────────────────┘
               ↓
┌──────────────────────────────────┐
│ Zero-shot Classification (LLM)   │
│                                  │
│ Input: hour summaries + templates│
│ Prompt: "Classify into one of:   │
│  강의, 회의, 대화, 메모, 기타.   │
│  Explain reasoning."             │
│                                  │
│ Output:                          │
│ {                                │
│   "template": "lecture_note",    │
│   "confidence": 0.92,            │
│   "segments": [                  │
│     {start: "00:00", end: "01:30",│
│      template: "lecture_note"},   │
│     {start: "01:30", end: "02:00",│
│      template: "friend_convo"}   │
│   ]                              │
│ }                                │
└──────────────┬───────────────────┘
               ↓
┌──────────────────────────────────┐
│ Template Matcher                 │
│ ├─ Match segments to templates   │
│ ├─ Fill template variables       │
│ └─ Generate Markdown per segment │
└──────────────┬───────────────────┘
               ↓
         DB: Save classifications
         Files: Export Obsidian-compatible .md files
         (YAML frontmatter + [[wikilinks]] from RAG similarity)
```

### Pipeline E: Obsidian Markdown 내보내기

```
Classification complete → Export trigger
    ↓
┌──────────────────────────────────┐
│ Obsidian Markdown Generator      │
│ ├─ YAML Frontmatter:             │
│ │   title, date, type, category, │
│ │   tags, keywords, speakers,    │
│ │   recording_id, confidence     │
│ ├─ Body: Summary + key points    │
│ ├─ Related: RAG similarity →     │
│ │   [[wikilinks]] to similar     │
│ │   recordings                   │
│ └─ Transcript: collapsible       │
│     section with timestamps      │
└──────────────┬───────────────────┘
               ↓
         Files: data/exports/ (or Obsidian vault path)
         Format: [type] Title - Date.md
```

---

## Provider 추상화 패턴

모든 외부 서비스(LLM, STT, Embedding)는 인터페이스를 통해 추상화됩니다.

```python
# src/services/llm/base.py
from abc import ABC, abstractmethod

class BaseLLM(ABC):
    @abstractmethod
    async def summarize(self, text: str, context: str = "") -> SummaryResult:
        """1분 전사본을 요약합니다."""
        pass
    
    @abstractmethod
    async def classify(self, text: str, templates: list[Template]) -> ClassificationResult:
        """전사본을 템플릿에 따라 분류합니다."""
        pass

# src/services/llm/claude_llm.py
class ClaudeLLM(BaseLLM):
    async def summarize(self, text, context=""):
        # Anthropic API 호출
        ...

# src/services/llm/ollama_llm.py  
class OllamaLLM(BaseLLM):
    async def summarize(self, text, context=""):
        # Ollama localhost 호출
        ...
```

```python
# src/services/rag/base.py
from abc import ABC, abstractmethod

class BaseEmbedding(ABC):
    @abstractmethod
    async def embed(self, text: str) -> list[float]:
        """텍스트를 벡터로 변환합니다."""
        pass

    @abstractmethod
    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """여러 텍스트를 배치로 벡터 변환합니다."""
        pass

class BaseVectorStore(ABC):
    @abstractmethod
    async def add(self, id: str, document: str, embedding: list[float], metadata: dict) -> None:
        pass

    @abstractmethod
    async def search(self, query_embedding: list[float], top_k: int = 5) -> list[dict]:
        pass
```

**장점**: `.env`에서 `LLM_PROVIDER`, `EMBEDDING_PROVIDER`만 바꾸면 전환 완료.

---

## 디렉토리 구조 & 책임

```
src/
├── core/                    # 설정, 모델, 이벤트, 예외
│   ├── config.py            # Pydantic Settings (.env 로드)
│   ├── models.py            # Pydantic 데이터 모델 (요청/응답)
│   ├── events.py            # 내부 이벤트 버스
│   └── exceptions.py        # VoiceVaultError 등 커스텀 예외
│
├── services/                # 비즈니스 로직 (핵심)
│   ├── audio/               # 오디오 입력, 청크 관리
│   ├── transcription/       # STT 서비스 (Whisper / Ollama)
│   ├── summarization/       # 1분/1시간/세션 요약
│   ├── classification/      # 자동 분류 + 템플릿 매칭
│   ├── llm/                 # LLM 추상화 (Claude / Ollama)
│   ├── rag/                 # RAG (임베딩 + ChromaDB + 검색)
│   └── storage/             # DB CRUD + Obsidian Markdown 내보내기
│
├── api/                     # FastAPI 라우터 (얇은 래퍼)
│   ├── app.py               # 앱 팩토리
│   ├── websocket.py         # 실시간 전사 WebSocket
│   └── routes/              # REST 엔드포인트
│
└── ui/                      # Streamlit 프론트엔드
    ├── app.py               # 메인 앱
    ├── pages/               # 멀티페이지 (녹음, 요약, 분류, 설정)
    └── components/          # 재사용 UI 컴포넌트
```

---

## 관련 문서

- [Data Schema & Pipeline](Data-Schema-&-Pipeline) - DB 스키마 상세
- [API Reference](API-Reference) - 엔드포인트 명세
- [Development Guide](Development-Guide) - 코딩 규칙
