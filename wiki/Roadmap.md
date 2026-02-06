# Roadmap

VoiceVault의 마일스톤, 개발 일정, 향후 확장 계획입니다.

---

## 해커톤 타임라인 (2026년 2월)

```
Week 0                Week 1                 Week 2                 Final
(Feb 6)               (Feb 7-13)             (Feb 14-20)            (Feb 21-22)
  │                     │                      │                      │
  ├─ GitHub 세팅        ├─ Core Pipeline       ├─ Classification      ├─ Polish
  ├─ Wiki 작성          ├─ Whisper STT         ├─ Template System     ├─ Demo 준비
  ├─ 프로젝트 구조      ├─ 1분 요약             ├─ 1시간 통합          ├─ 발표 자료
  └─ 첫 커밋            ├─ SQLite 저장          ├─ Cross-boundary     └─ 데모 영상
                        ├─ Streamlit UI         ├─ MD Export
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

### v0.2.0 - Smart Classification (Week 2)

**마감**: 2026-02-20 (금)

| # | Issue | Priority | 상태 |
|---|-------|----------|------|
| 9 | Zero-shot 자동 분류 서비스 | P1 | ▶ |
| 10 | 사용자 정의 템플릿 시스템 | P1 | ▶ |
| 11 | 1시간 통합 요약 (계층적 압축) | P1 | ▶ |
| 12 | 크로스 경계 구간 검색 | P2 | ▶ |
| 13 | Markdown 자동 생성 & 다운로드 | P1 | ▶ |
| 14 | UI 개선 (타임라인, 분류 결과) | P2 | ▶ |
| 15 | 최종 테스트 + 버그 수정 | P0 | ▶ |

**성공 기준**: 1시간 녹음 → 5분 내 자동 분류 + 요약 + MD 생성

---

### v0.3.0 - Demo Ready (Final)

**마감**: 2026-02-22 (일)

| Task | Priority |
|------|----------|
| 데모 시나리오 완성 (8시간 시뮬레이션) | P0 |
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

[결과]
├── 👥 친구 노트 (2개)
│   ├── Sarah - Project Meeting
│   └── Friend2 - Academic Check-in
├── 📚 강의 노트
│   └── Advanced AI - LangChain & Agents
└── 💡 개인 메모
    └── Study Session - LangGraph Deep Dive
```

---

## 향후 확장 계획

### Phase 2: 고급 기능 (2026 Q2)

| 기능 | 설명 | 기술 |
|------|------|------|
| 화자 분리 | 누가 언제 말했는지 자동 감지 | Pyannote 3.1 |
| RAG 벡터 검색 | 과거 녹음에서 관련 내용 검색 | FAISS + SQLite |
| 세션 간 맥락 유지 | "아까 말한 그 프로젝트" 자동 해석 | LangGraph thread_id |
| 학습 기반 분류 개선 | 사용자 수정 패턴 학습 | Few-shot learning |

### Phase 3: 플랫폼 확장 (2026 Q3)

| 기능 | 설명 | 기술 |
|------|------|------|
| Obsidian 플러그인 | Vault 내 직접 통합 | TypeScript + Obsidian API |
| Notion 연동 | 노트 자동 동기화 | Notion API |
| 웹 클라우드 버전 | 클라우드 동기화 + 다기기 | Supabase + Vercel |
| 모바일 앱 | iOS/Android | React Native |

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
