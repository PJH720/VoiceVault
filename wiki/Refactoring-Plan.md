# VoiceVault 아키텍처 리팩토링 계획

**문서 작성일**: 2026-02-15  
**목적**: 프론트엔드/백엔드 분리 및 TypeScript 단독 도입을 위한 구조 변경 계획  
**마일스톤**: v0.4.0 ([Roadmap](Roadmap) 참고)

---

## 1. 목표

| 목표 | 설명 |
|------|------|
| **구조 분리** | `backend/` (Python) + `frontend/` (TypeScript)로 한눈에 구분되는 구조 |
| **프론트엔드 현대화** | Streamlit → React/Next.js 전환 |
| **타입 안전성** | Pydantic ↔ TypeScript 인터페이스 동기화 |
| **Obsidian 플러그인 준비** | TypeScript 기반 UI → v1.0 플러그인 코드 재사용 |
| **기능 최적화** | Web Audio API, 실시간 WebSocket, 반응형 UI |

---

## 2. 목표 디렉토리 구조

```
VoiceVault/
├── backend/                    # Python (FastAPI)
│   ├── src/
│   │   ├── api/               # REST + WebSocket endpoints
│   │   │   ├── app.py
│   │   │   ├── websocket.py
│   │   │   └── routes/
│   │   ├── core/              # Config, models, exceptions
│   │   └── services/          # STT, LLM, RAG, Storage
│   ├── tests/
│   ├── pyproject.toml
│   └── requirements.txt
│
├── frontend/                   # TypeScript (Next.js)
│   ├── src/
│   │   ├── app/               # Pages (App Router)
│   │   │   ├── page.tsx       # 홈
│   │   │   ├── recording/     # 녹음 페이지
│   │   │   ├── summaries/     # 요약 페이지
│   │   │   ├── rag/           # RAG 검색 페이지
│   │   │   ├── export/        # 내보내기 페이지
│   │   │   └── templates/     # 템플릿 관리 페이지
│   │   ├── components/        # UI 컴포넌트
│   │   │   ├── Recorder.tsx
│   │   │   ├── SummaryCard.tsx
│   │   │   ├── RAGResult.tsx
│   │   │   └── ...
│   │   ├── hooks/             # 커스텀 훅
│   │   │   ├── useRecorder.ts
│   │   │   ├── useWebSocket.ts
│   │   │   └── useRAG.ts
│   │   ├── lib/               # API client, utils
│   │   │   └── api.ts
│   │   └── types/             # TypeScript 인터페이스
│   │       └── api.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── next.config.js
│
├── shared/                     # 공유 스키마 (optional)
│   └── api-schema.json        # OpenAPI spec (백엔드에서 export)
│
├── templates/                  # Classification templates (JSON)
├── wiki/                       # 사용자/개발자 문서
├── docker-compose.yml
├── Makefile
└── README.md
```

---

## 3. 마이그레이션 단계

### Phase 1: 백엔드 분리 (비파괴적)

1. `backend/` 디렉토리 생성
2. `src/api/`, `src/core/`, `src/services/` → `backend/src/` 하위로 이동
3. `tests/` → `backend/tests/` 이동
4. `pyproject.toml`, `requirements.txt` → `backend/`로 이동 또는 복사
5. import 경로 수정 (`src.` → `backend.src.` 또는 상대 경로)
6. 루트에서 `uv run --project backend uvicorn backend.src.api.app:app` 등으로 실행 확인

### Phase 2: 프론트엔드 초기화

1. `frontend/` 디렉토리 생성
2. `npx create-next-app@latest frontend --typescript --tailwind --app`
3. `frontend/src/types/api.ts` — API 타입 정의 (수동 또는 openapi-typescript)
4. `frontend/src/lib/api.ts` — fetch 기반 API 클라이언트
5. 환경 변수: `NEXT_PUBLIC_API_URL=http://localhost:8000`

### Phase 3: 페이지별 마이그레이션

| 순서 | 페이지 | Streamlit 파일 | Next.js 경로 | 우선순위 |
|------|--------|---------------|--------------|----------|
| 1 | Recording | `01_recording.py` | `app/recording/page.tsx` | P0 |
| 2 | Summaries | `02_summaries.py` | `app/summaries/page.tsx` | P0 |
| 3 | RAG Search | `03_rag_search.py` | `app/rag/page.tsx` | P1 |
| 4 | Export | `04_export.py` | `app/export/page.tsx` | P1 |
| 5 | Templates | `05_templates.py` | `app/templates/page.tsx` | P2 |

### Phase 4: 정리 및 문서화

1. `src/ui/` (Streamlit) 제거
2. `streamlit` 의존성 제거
3. `docker-compose.yml` 업데이트 (frontend 서비스 추가)
4. `README.md`, `CLAUDE.md`, `wiki/` 업데이트
5. CI/CD 파이프라인 수정 (frontend 빌드 추가)

---

## 4. API 계약 유지

### 4.1 REST API

- **Base URL**: `http://localhost:8000/api/v1`
- **변경 없음**: 기존 FastAPI 라우트 그대로 유지
- **CORS**: `frontend` origin 허용 (`http://localhost:3000` 등)

### 4.2 WebSocket

- **Endpoint**: `ws://localhost:8000/ws/transcribe?recording_id={id}`
- **프로토콜**: Client → PCM bytes, Server → JSON `{type, data}`
- **변경 없음**: 기존 WebSocket 핸들러 그대로 사용

### 4.3 타입 동기화

```bash
# OpenAPI spec에서 TypeScript 타입 생성 (권장)
cd backend && uvicorn src.api.app:app --host 0.0.0.0 --port 8000 &
curl http://localhost:8000/openapi.json > shared/api-schema.json
npx openapi-typescript shared/api-schema.json -o frontend/src/types/api.generated.ts
```

---

## 5. 개발 환경

### 5.1 로컬 실행

```bash
# Terminal 1: Backend
cd backend && uv run uvicorn src.api.app:app --reload --port 8000

# Terminal 2: Frontend
cd frontend && pnpm dev
```

### 5.2 Docker

```yaml
# docker-compose.yml (개념)
services:
  backend:
    build: ./backend
    ports: ["8000:8000"]
  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8000
```

---

## 6. 위험 요소 및 완화

| 위험 | 완화 전략 |
|------|-----------|
| import 경로 대규모 변경 | `backend/` 내부에서 `src` 기준 유지, `PYTHONPATH` 설정 |
| Streamlit 의존 코드 | 페이지별 점진적 마이그레이션, 병행 운영 기간 |
| OpenAPI spec 불일치 | Pydantic 모델에 `model_config`로 예시 추가, 수동 타입 보완 |
| CORS 이슈 | FastAPI `CORSMiddleware`에 frontend origin 명시 |

---

## 7. 성공 기준

- [ ] `backend/` 단독 실행 시 기존 API/WebSocket 동작
- [ ] `frontend/`에서 Recording → Summaries → RAG → Export → Templates 전체 플로우 동작
- [ ] TypeScript 타입으로 API 응답 검증
- [ ] `pytest` + `pnpm test` 모두 통과
- [ ] `docker-compose up`으로 풀 스택 실행 가능

---

## 관련 문서

- [Roadmap](Roadmap) — v0.4.0 마일스톤 상세
- [TypeScript Migration](TypeScript-Migration) — TypeScript 단독 도입 이점
- [Architecture](Architecture) — 기존 기술 아키텍처
- `CLAUDE.md` — 프로젝트 가이드 (리팩토링 목표 섹션)
