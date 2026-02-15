# Roadmap

VoiceVault의 마일스톤, 개발 일정, 향후 확장 계획입니다.

---

## 해커톤 타임라인 (2026년 2월)

```
Week 0                Week 1                 Week 2                      Final
(Feb 6)               (Feb 7-13)             (Feb 14-20)                 (Feb 21-22)
  │                     │                      │                           │
  ├─ GitHub 세팅        ├─ Core Pipeline       ├─ Classification           ├─ Polish
  ├─ Wiki 작성          ├─ Whisper STT         ├─ RAG (ChromaDB+검색)      ├─ Demo 준비
  ├─ 프로젝트 구조      ├─ 1분 요약             ├─ Cross-boundary           ├─ RAG 데모
  └─ 첫 커밋            ├─ SQLite 저장          ├─ Obsidian MD Export       ├─ 발표 자료
                        ├─ Streamlit UI         ├─ RAG Search UI            └─ 데모 영상
                        └─ E2E 테스트           └─ 최종 테스트
```

---

## Milestone 상세

### v0.1.0 - Core Pipeline (Week 1)

**마감**: 2026-02-13 (금)

| # | Issue | Priority | 상태 |
|---|-------|----------|------|
| 1 | 프로젝트 초기 세팅 (pyproject.toml, Docker) | P0 | ▶ |
| 2 | FastAPI 앱 팩토리 + WebSocket 엔드포인트 | P0 | ▶ |
| 3 | Whisper 실시간 전사 서비스 | P0 | ▶ |
| 4 | 1분 단위 자동 요약 서비스 | P0 | ▶ |
| 5 | SQLite DB 스키마 + CRUD | P0 | ▶ |
| 6 | Streamlit 기본 UI | P1 | ▶ |
| 7 | LLM Provider 인터페이스 (Claude + Ollama) | P1 | ▶ |
| 8 | E2E 통합 테스트 | P1 | ▶ |

**성공 기준**: 30초 녹음 → 실시간 전사 → 요약 생성 → 저장 완료

---

### v0.2.0 - Classification + RAG + Obsidian (Week 2)

**마감**: 2026-02-20 (금)

| # | Issue | Priority | 상태 |
|---|-------|----------|------|
| 9 | Zero-shot 자동 분류 서비스 | P1 | ▶ |
| 10 | 사용자 정의 템플릿 시스템 | P1 | ▶ |
| 11 | 1시간 통합 요약 (계층적 압축) | P1 | ▶ |
| 12 | RAG: ChromaDB 벡터 스토어 + 임베딩 파이프라인 | P0 | ▶ |
| 13 | RAG: 자연어 검색 API + 유사 녹음 조회 | P0 | ▶ |
| 14 | 크로스 경계 구간 검색 | P2 | ▶ |
| 15 | Obsidian 호환 Markdown 내보내기 (frontmatter + wikilinks) | P1 | ▶ |
| 16 | UI 개선 (타임라인, 분류 결과, RAG 검색 패널) | P2 | ▶ |
| 17 | 최종 테스트 + 버그 수정 | P0 | ▶ |

**성공 기준**: 1시간 녹음 → 자동 분류 → RAG 검색 → Obsidian MD 내보내기

---

### v0.3.0 - Demo Ready (Final)

**마감**: 2026-02-22 (일)

| Task | Priority |
|------|----------|
| 데모 시나리오 완성 (8시간 시뮬레이션) | P0 |
| RAG 데모: 자연어 쿼리로 과거 녹음 검색 | P0 |
| Obsidian vault 통합 데모 | P0 |
| 발표 자료 (슬라이드) 준비 | P0 |
| README & 문서 최종 정리 | P1 |
| 데모 영상 촬영 | P1 |
| 버그 수정 & 성능 최적화 | P0 |

---

## 데모 시나리오

### 8시간 하루 시뮬레이션

```
1️⃣  09:00~09:45  친구와 카페 대화
    "프로젝트 deadline이 다음 주 금요일이라더..."
   
2️⃣  10:30~12:00  교수 강의 (Advanced AI)
    "오늘은 LangChain과 Agent 설계를 배우겠습니다..."
   
3️⃣  12:00~13:00  점심 식사 (또 다른 친구)
    "학기는 어때? 과제 많아?"
   
4️⃣  13:00~18:00  도서관 개인 공부
    "음, LangGraph 체크포인트 시스템이 중요한데..."

[녹음 종료 → AI 처리: 30초]

[결과 - Obsidian 호환 Markdown 내보내기]
├── 👥 [대화] Sarah - Project Meeting.md (YAML frontmatter + wikilinks)
├── 👥 [대화] Friend2 - Academic Check-in.md
├── 📚 [강의] Advanced AI - LangChain & Agents.md
└── 💡 [메모] Study Session - LangGraph Deep Dive.md

[RAG 검색 데모]
Query: "LangChain Agent 설계 패턴에 대해 뭐라고 했지?"
→ ChromaDB 유사도 검색 → 강의 + 스터디 세션 매칭
→ "Advanced AI 강의에서 Agent 설계 패턴은... [source: 10:30~12:00]"
```

---

### v0.4.0 - Frontend/Backend Split + TypeScript Migration

**상태**: ✅ Complete

| # | Task | Priority | 상태 |
|---|------|----------|------|
| 1 | Backend directory split (`backend/src/`) | P0 | ✅ |
| 2 | Next.js + TypeScript frontend scaffolding | P0 | ✅ |
| 3 | Recording page migration (Next.js) | P0 | ✅ |
| 4 | Summaries page migration (Next.js) | P0 | ✅ |
| 5 | OpenAPI → TypeScript type generation pipeline | P0 | ✅ |
| 6 | CI: frontend lint/test/build jobs | P1 | ✅ |
| 7 | Docker Compose + Makefile orchestration | P1 | ✅ |
| 8 | **Streamlit deprecation notice added** | P1 | ✅ |
| 9 | Streamlit deprecation plan documented | P1 | ✅ |

> **Streamlit 전략**: `src/ui/`는 유지하되 deprecation notice 추가.
> 신규 UI 기능은 Next.js(`frontend/`)에만 추가. 버그 수정은 critical만 대응.
> 자세한 내용은 [docs/streamlit-deprecation-plan.md](../docs/streamlit-deprecation-plan.md) 참조.

---

### v0.5.0 - RAG Search + Export UI + Obsidian Integration

**상태**: 📋 Planned

| # | Task | Priority | 상태 |
|---|------|----------|------|
| 1 | RAG Search page (Next.js) | P1 | ▶ |
| 2 | Export page — Obsidian Markdown (Next.js) | P1 | ▶ |
| 3 | Obsidian vault integration refactor | P1 | ▶ |
| 4 | **Streamlit soft removal**: startup warning, docs updated to Next.js only | P2 | ▶ |

> **Streamlit 제거 게이트**: P0+P1 기능(Recording, Summaries, RAG, Export)이
> Next.js에서 완성되면 `src/ui/` 제거 준비 완료.

---

### v0.6.0 - Templates UI + Streamlit Complete Removal

**상태**: 📋 Planned

| # | Task | Priority | 상태 |
|---|------|----------|------|
| 1 | Templates page (Next.js) | P2 | ▶ |
| 2 | **DELETE `src/ui/` directory** | P1 | ▶ |
| 3 | Remove `streamlit` from `backend/requirements.txt` | P1 | ▶ |
| 4 | Remove port 8501 from CORS config | P2 | ▶ |
| 5 | Update CLAUDE.md, AGENTS.md — remove Streamlit refs | P2 | ▶ |

> **완전 제거 조건**: P0+P1 기능 패리티 확인, Streamlit 관련 버그 리포트 30일 이상 없음,
> CI가 streamlit 없이 통과. 자세한 기준은 [deprecation plan §3](../docs/streamlit-deprecation-plan.md#3-removal-criteria) 참조.

---

## 향후 확장 계획

### Phase 2: 고급 기능 (2026 Q2)

| 기능 | 설명 | 기술 |
|------|------|------|
| 화자 분리 | 누가 언제 말했는지 자동 감지 | Pyannote 3.1 |
| 세션 간 맥락 유지 | "아까 말한 그 프로젝트" 자동 해석 | LangGraph thread_id |
| 학습 기반 분류 개선 | 사용자 수정 패턴 학습 | Few-shot learning |
| RAG 고도화 | Re-ranker, HyDE, Multi-query | FAISS + cross-encoder |

### Phase 3: 플랫폼 확장 (2026 Q3)

| 기능 | 설명 | 기술 |
|------|------|------|
| Obsidian 네이티브 플러그인 | Vault 내 녹음+RAG 직접 통합 | TypeScript + Obsidian API |
| Notion 연동 | 노트 자동 동기화 | Notion API |
| 웹 클라우드 버전 | 클라우드 동기화 + 다기기 | Supabase + Vercel |
| 모바일 앱 | iOS/Android | React Native |

> **Note**: RAG 벡터 검색과 Obsidian 호환 Markdown 내보내기는 v0.2.0 (Week 2 MVP)로 이동되었습니다.
> Phase 3의 Obsidian 플러그인은 TypeScript 네이티브 플러그인으로, MVP의 Markdown 내보내기와 별개입니다.

### Phase 4: 엔터프라이즈 (2026 Q4)

| 기능 | 설명 |
|------|------|
| 다중 사용자 | 팀 단위 녹음 관리 |
| 권한 관리 | RBAC (읽기/쓰기/삭제) |
| 감사 로그 | 접근 이력 추적 |
| 규정 준수 | GDPR, HIPAA 인증 |
| SSO | 기업용 인증 연동 |

---

## 성공 지표

### 해커톤 목표

| 지표 | 목표 | 비고 |
|------|------|------|
| 속도 | 1시간 녹음 → 5분 내 요약 | 계층적 압축으로 달성 |
| 분류 정확도 | 85%+ | Claude zero-shot 91% |
| 연속 녹음 | 12시간+ | SQLite + 1시간 분할 |
| 프라이버시 | 0% 외부 저장 | Ollama 완전 로컬 |
| RAG 응답 시간 | < 5초 | ChromaDB HNSW 인덱스 |
| RAG 관련성 | recall@5 > 80% | 메타데이터 강화 검색 |
| Obsidian 내보내기 | 완전 호환 | frontmatter + wikilinks |
| 데모 완성도 | 93/100점 | 상위 10-15% 목표 |

### 장기 목표

| 지표 | 목표 | 기간 |
|------|------|------|
| GitHub Stars | 1,000+ | 6개월 |
| Community Plugin | Obsidian 공식 등록 | 3개월 |
| Monthly Users | 500+ | 6개월 |

---

## 관련 문서

- [Home](Home) - 프로젝트 개요
- [Architecture](Architecture) - 현재 아키텍처
- [Development Guide](Development-Guide) - 기여 방법
