# AGENTS.md — AI 에이전트 참고 가이드

**목적**: VoiceVault 프로젝트에서 작업하는 AI 에이전트가 참고할 핵심 정보  
**최종 수정**: 2026-02-15  
**버전**: v0.5.0 (Agent Architecture + Plugin Refactoring)

---

## 1. 프로젝트 개요

VoiceVault는 **AI 음성 녹음기**로, 실시간 전사·요약·자동 분류·RAG 검색·Obsidian 내보내기를 제공한다.

- **스택**: Python (FastAPI) + Streamlit → **리팩토링 중**: Python (backend) + TypeScript (frontend)
- **로드맵**: v0.3.0 완료 → v0.4.0 구조 분리 → v0.5.0 에이전트 아키텍처 + 플러그인 리팩토링 → v1.0 Obsidian 플러그인

---

## 2. 에이전트가 반드시 참고할 문서

| 문서 | 용도 |
|------|------|
| **CLAUDE.md** | 프로젝트 구조, 아키텍처, 코딩 규칙, API 개요, v0.5.0 로드맵 |
| **wiki/Refactoring-Plan.md** | 리팩토링 단계, 목표 구조 |
| **wiki/Roadmap.md** (v0.4.0 섹션) | v0.4.0 마일스톤 (구조 분리 + TS 전환) |
| **wiki/TypeScript-Migration.md** | TypeScript 단독 도입 이점, 기술 선택 근거 |
| **wiki/Architecture.md** | 기존 데이터 흐름, 기술 스택 |
| **.claude/agents.json** | Multi-Agent Orchestration 설정 |
| **.claude/config.json** | MCP 서버 구성 |

---

## 3. Claude Code Agent Architecture (v0.5.0)

### 3.1 Multi-Agent Orchestration

v0.5.0에서는 단일 에이전트 대신 **역할별 서브 에이전트**를 활용한 협업 워크플로우를 도입한다.

```
[Orchestrator (Main Agent)]
       │
       ├── 1. Architect (분석/설계) ── Read-only, Mermaid 다이어그램 산출
       │
       ├── 2. TestEngineer (테스트) ── 특성 테스트/유닛 테스트 작성
       │
       ├── 3. Refactorer (구현) ──── 코드 수정, 한 번에 하나의 모듈
       │
       └── 4. Reviewer (검증) ────── CRITICAL/WARNING/SUGGESTION 등급 리뷰
```

| 에이전트 | 역할 | 권한 | 모델 |
|----------|------|------|------|
| **Architect** | 구조 분석, 의존성 그래프, 설계 문서 작성 | Read-only | Sonnet/Opus |
| **Refactorer** | Architect 명세에 따른 코드 수정 | Read/Write | Sonnet |
| **Reviewer** | 스타일 가이드, 타입 안전성, 보안 검증 | Read-only | Sonnet/Opus |
| **TestEngineer** | 특성 테스트, 유닛/통합 테스트 작성 | Read/Write | Sonnet |

**설정 파일**: `.claude/agents.json`

### 3.2 MCP (Model Context Protocol) 구성

에이전트가 외부 도구에 접근하는 표준 프로토콜:

| MCP 서버 | 용도 | 보안 |
|----------|------|------|
| **filesystem** | 프로젝트 + Obsidian Vault 파일 접근 | 허용 경로만 마운트 |
| **obsidian** | Obsidian Local REST API 통신 (실시간 컨텍스트) | API 키 환경변수 주입 |
| **git** | 자동화된 버전 관리 (커밋, 브랜치) | 프로젝트 디렉토리 한정 |
| **sequential-thinking** | 복잡한 리팩토링 시 단계별 사고 강제 | - |

**설정 파일**: `.claude/config.json`

**하이브리드 전략**:
- `filesystem` MCP: 소스 코드와 문서의 대량 읽기/쓰기, 검색
- `obsidian` MCP: 현재 작업 중인 컨텍스트 파악, Obsidian 내부 검색

### 3.3 Skills (도메인 지식 캡슐화)

필요할 때만 동적으로 로드되는 지식 패키지:

| 스킬 | 슬래시 커맨드 | 용도 |
|------|-------------|------|
| **refactor-module** | `/refactor-module` | extract-service, extract-view, fix-types 전략별 모듈 리팩토링 |
| **obsidian-api-guide** | `/obsidian-api` | Obsidian Plugin API 패턴, 안전한 DOM 조작, 이벤트 관리 |
| **frontend-migration** | `/migrate-page` | Streamlit → Next.js + TypeScript 페이지별 마이그레이션 |
| **git-workflow** | `/git-workflow` | 브랜치 전략, 커밋 컨벤션, 리팩토링 안전 워크플로우 |
| **api-contract** | `/api-contract` | OpenAPI ↔ TypeScript 타입 동기화, API 계약 검증 |

**위치**: `.claude/skills/{skill-name}/SKILL.md`

---

## 4. 리팩토링 관련 핵심 원칙

1. **비파괴적 전환**: 기존 API/WebSocket 프로토콜 변경 없음
2. **점진적 마이그레이션**: 페이지별(Recording → Summaries → RAG → Export → Templates) 순차 전환
3. **타입 동기화**: Pydantic ↔ TypeScript 인터페이스 일치 유지
4. **Obsidian 호환**: 프론트엔드 컴포넌트는 향후 Obsidian 플러그인에서 재사용 가능하도록 설계
5. **SOLID 원칙**: 단일 책임, 개방/폐쇄, 인터페이스 분리, 의존성 역전
6. **MVVM 패턴**: View(렌더링) → Controller(이벤트) → Service(비즈니스) → Data Layer
7. **Dependency Injection**: 생성자 주입으로 서비스 간 강결합 방지
8. **Atomic Commits**: 리팩토링 시 작은 단위로 자주 커밋

---

## 5. 디렉토리 구조

### 현재 구조 (v0.3.0)
```
VoiceVault/
├── src/                  # 모놀리식 Python 코드
│   ├── api/              # FastAPI
│   ├── core/             # Config, models, exceptions
│   ├── services/         # 비즈니스 로직
│   └── ui/               # Streamlit UI
├── .claude/              # Claude Code 에이전트 설정
│   ├── config.json       # MCP 서버 구성
│   ├── agents.json       # Multi-Agent 설정
│   ├── settings.local.json
│   └── skills/           # 도메인 스킬
├── templates/            # JSON 분류 템플릿
└── wiki/                 # 사용자/개발자/리팩토링 문서 (git 추적)
```

### 목표 구조 (v0.5.0+)
```
VoiceVault/
├── backend/              # Python FastAPI
│   ├── src/
│   │   ├── api/          # REST + WebSocket
│   │   ├── core/         # Config, models
│   │   └── services/     # STT, LLM, RAG, Storage
│   └── tests/
├── frontend/             # TypeScript Next.js
│   ├── src/
│   │   ├── app/          # Pages (App Router)
│   │   ├── components/   # UI 컴포넌트 (Obsidian 재사용 가능)
│   │   ├── hooks/        # useRecorder, useWebSocket, useRAG
│   │   ├── lib/          # API client, utils
│   │   └── types/        # TypeScript 인터페이스 (API 계약)
│   └── tests/
├── shared/               # OpenAPI schema → 양쪽 타입 자동생성
├── .claude/              # Claude Code 에이전트 설정
├── templates/            # Classification templates
└── wiki/                 # 문서
```

---

## 6. v0.5.0 마일스톤 — 4주 계획

| Phase | Week | 주요 작업 | 에이전트 |
|-------|------|----------|---------|
| **Phase 1** | Week 1 | 스냅샷 테스트 구축, 의존성 분석, 빌드 현대화 | TestEngineer, Architect |
| **Phase 2** | Week 2 | 디렉토리 구조 개편, Service Layer 추출, DI 도입 | Refactorer |
| **Phase 3** | Week 3 | View 분리, MVVM 패턴, Settings 컴포넌트화 | Refactorer |
| **Phase 4** | Week 4 | Strict TypeScript, 성능 최적화, 문서화 | Reviewer, Refactorer |

---

## 7. 코드 변경 시 체크리스트

- [ ] **Python**: `uv` 사용, `ruff` 린트/포맷 준수, `mypy` 타입 체크
- [ ] **TypeScript**: `tsconfig` strict 모드, ESLint 준수, `any` 타입 금지
- [ ] **API**: 기존 엔드포인트 시그니처 유지 (비파괴적)
- [ ] **테스트**: `pytest` (backend), `pnpm test` (frontend) 통과
- [ ] **타입 동기화**: Pydantic 모델 변경 시 OpenAPI → TS 타입 재생성
- [ ] **문서**: 변경 사항이 CLAUDE.md, AGENTS.md, wiki에 반영되는지 확인
- [ ] **커밋**: `type(scope): description` 형식, atomic commits
- [ ] **보안**: API 키 하드코딩 없음, 파일 경로 sanitize

---

## 8. 자주 하는 실수 (피할 것)

1. **pip 사용**: `uv pip install` 사용
2. **Streamlit 직접 호출**: API를 통해서만 백엔드 접근
3. **하드코딩**: API URL, 모델명 등은 `.env` 또는 설정에서 로드
4. **Provider 고정**: Claude/Ollama 등 provider는 설정으로 전환 가능해야 함
5. **any 타입 사용**: TypeScript에서 `any` 금지, 구체적 인터페이스 사용
6. **innerHTML 사용**: Obsidian 코드에서 `createEl()` 등 안전한 API 사용
7. **동기 I/O**: 모든 파일/DB/API 호출에 `async/await` 사용
8. **거대 커밋**: 하나의 커밋에 여러 변경 포함 금지 → atomic commits
9. **Node.js 전용 모듈**: Obsidian 모바일 호환을 위해 `fs`, `path` 직접 사용 금지
10. **이벤트 리스너 누수**: `registerEvent()` 사용, 수동 리스너는 반드시 해제

---

## 9. 빠른 명령어

```bash
# Backend
uv run uvicorn src.api.app:app --reload --port 8000

# Frontend (리팩토링 후)
cd frontend && pnpm dev

# 테스트
pytest tests/ -v                          # Python 전체
pytest tests/ -v --cov=src --cov-report=html  # 커버리지
cd frontend && pnpm test                  # TypeScript

# 린트
ruff check src/ tests/                    # Python lint
ruff format src/ tests/                   # Python format
cd frontend && pnpm lint                  # TypeScript lint

# 타입 체크
mypy src/ --ignore-missing-imports        # Python
cd frontend && npx tsc --noEmit --strict  # TypeScript

# Claude Code Agent 실행
claude --agents .claude/agents.json       # Multi-Agent 모드

# API 타입 생성
curl http://localhost:8000/openapi.json > shared/api-schema.json
npx openapi-typescript shared/api-schema.json -o frontend/src/types/api.generated.ts
```

---

## 10. 문의 및 이슈

- GitHub Issues: 프로젝트 저장소
- 문서 수정: CLAUDE.md, AGENTS.md, wiki/ 동기화 유지
- Agent 설정 수정: `.claude/` 디렉토리 내 파일 업데이트 후 커밋
