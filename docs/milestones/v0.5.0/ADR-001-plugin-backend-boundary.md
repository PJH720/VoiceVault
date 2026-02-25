# ADR-001: Plugin-Backend 경계 설계

| 항목 | 내용 |
|------|------|
| **상태** | ✅ Accepted |
| **날짜** | 2026-02-25 |
| **관련 이슈** | [#141](https://github.com/PJH720/VoiceVault/issues/141) |
| **결정자** | Jae-hyun Park |

---

## 1. 컨텍스트 (Context)

VoiceVault v0.5.0에서 Obsidian Plugin 레이어(`plugin/`)를 추가합니다. Plugin은 TypeScript로 작성되며, 기존 Python FastAPI Backend와 통신합니다.

이 시점에서 다음 질문에 명확히 답해야 합니다:

- **어떤 로직이 Plugin에 있고, 어떤 로직이 Backend에 있는가?**
- **Plugin과 Backend는 어떻게 통신하는가?**
- **Backend 없이 Plugin이 할 수 있는 것은 무엇인가?**

이 결정 없이 구현을 시작하면, 로직 중복·책임 혼재·테스트 불가능한 구조가 발생합니다.

---

## 2. 결정 (Decision)

### 2.1 책임 분리 원칙

```
┌───────────────────────────────────────────────────┐
│              Obsidian Plugin (TypeScript)           │
│                                                     │
│  ✅ UI 렌더링 (ItemView, Modal, Notice)             │
│  ✅ 로컬 캐시 (in-memory, 세션 범위)               │
│  ✅ Vault 파일 I/O (app.vault API 사용)            │
│  ✅ 사용자 설정 관리 (SettingTab, this.settings)   │
│  ✅ Backend 연결 상태 확인 (health check)          │
│  ✅ 에러 표시 (Notice, Modal)                      │
│                                                     │
│  ❌ STT (Whisper) 처리       → Backend             │
│  ❌ LLM 요약/분류            → Backend             │
│  ❌ RAG 검색/임베딩          → Backend             │
│  ❌ DB CRUD (SQLite)         → Backend             │
│  ❌ ChromaDB 벡터 연산       → Backend             │
│  ❌ 파일 처리 (오디오 변환)   → Backend            │
└───────────────────────────────────────────────────┘
                        │ HTTP (requestUrl)
                        │ REST API only
┌───────────────────────────────────────────────────┐
│              FastAPI Backend (Python)               │
│                                                     │
│  ✅ STT: Whisper 실시간/배치 전사                  │
│  ✅ LLM: 1분 요약, 시간 통합 요약, 분류            │
│  ✅ RAG: ChromaDB 임베딩 + 유사도 검색             │
│  ✅ 영구 저장: SQLite CRUD                         │
│  ✅ 오디오 처리: 청크 관리, 포맷 변환              │
│  ✅ Export: Obsidian Markdown 생성 로직            │
└───────────────────────────────────────────────────┘
```

### 2.2 통신 프로토콜

| 항목 | 결정 | 근거 |
|------|------|------|
| 프로토콜 | **HTTP REST (requestUrl)** | Obsidian의 `requestUrl` API는 CORS를 우회하며, WebSocket은 Plugin 환경에서 추가 설정 필요 |
| 인증 방식 | **Bearer Token (API Key)** | Plugin Settings에 저장, `Authorization: Bearer <key>` 헤더로 전송 |
| Base URL | 사용자 설정 (기본: `http://localhost:8000`) | 자체 호스팅 지원 |
| 요청 형식 | JSON (`Content-Type: application/json`) | 기존 FastAPI 계약과 일치 |
| 에러 형식 | `{ "detail": string, "code": string }` | FastAPI HTTPException 기본 형식 |
| 타임아웃 | 30초 (기본), RAG 검색 60초 | RAG는 LLM 호출 포함으로 더 긴 타임아웃 필요 |

**WebSocket 미사용 이유**: v0.5.0에서는 Plugin이 실시간 녹음 기능을 직접 구현하지 않음 (Next.js 프론트엔드의 영역). Plugin은 조회/검색/내보내기만 담당.

### 2.3 Plugin이 사용하는 API 엔드포인트

| 기능 | Method | Endpoint | 설명 |
|------|--------|----------|------|
| 연결 확인 | GET | `/api/v1/health` | Plugin 로드 시 연결 검증 |
| 녹음 목록 조회 | GET | `/api/v1/recordings` | 녹음 목록 (페이지네이션) |
| 녹음 상세 | GET | `/api/v1/recordings/{id}` | 단일 녹음 + 요약 |
| RAG 검색 | POST | `/api/v1/rag/search` | 자연어 쿼리 → 결과 + 출처 |
| Markdown 내보내기 | POST | `/api/v1/export` | 녹음 → Obsidian Markdown |
| 배치 내보내기 | POST | `/api/v1/export/batch` | 여러 녹음 동시 내보내기 |

### 2.4 오프라인 동작 전략

Backend 없이 Plugin이 할 수 있는 것:

| 동작 | 오프라인 가능 여부 | 처리 방식 |
|------|------------------|-----------|
| Plugin 로드 | ✅ 가능 | 로드 성공, 연결 상태 표시만 변경 |
| 설정 변경 | ✅ 가능 | `this.settings`는 로컬 저장 |
| Vault 파일 읽기 | ✅ 가능 | `app.vault.read()` 로컬 동작 |
| 녹음 목록 조회 | ❌ 불가 | Notice("Backend 연결 필요") 표시 |
| RAG 검색 | ❌ 불가 | Graceful degradation + 재시도 버튼 |
| Markdown 내보내기 | ❌ 불가 | Notice + 백엔드 재연결 안내 |

---

## 3. 고려한 대안 (Alternatives Considered)

### 대안 A: Plugin에서 직접 STT/LLM 처리
- **장점**: Backend 불필요, 완전 로컬
- **단점**: Obsidian Plugin은 Node.js 환경 제한으로 Whisper/LLM 라이브러리 직접 실행 어려움. 모바일 호환성 0%.
- **결론**: ❌ 기각

### 대안 B: WebSocket으로 실시간 통신
- **장점**: 실시간 녹음 스트리밍 가능
- **단점**: v0.5.0 범위 초과. Obsidian 환경에서 WebSocket은 추가 보안 심사 필요.
- **결론**: ❌ v1.0으로 연기

### 대안 C: Obsidian Local REST API (커뮤니티 플러그인) 중개
- **장점**: Obsidian Vault를 API로 접근 가능
- **단점**: 서드파티 플러그인 의존성 추가, 사용자 설치 부담
- **결론**: ❌ 기각 (직접 구현으로 대체)

---

## 4. 결과 (Consequences)

### 긍정적 결과
- Plugin 코드가 UI 로직에 집중 → 테스트 용이
- Backend는 기존 Next.js 프론트엔드와 동일 API 공유 → 이중 유지보수 없음
- Plugin은 경량화 → Obsidian 커뮤니티 플러그인 심사 통과 가능성 ↑

### 부정적 결과 / 트레이드오프
- Plugin 사용을 위해 반드시 Backend가 실행 중이어야 함 → UX 진입 장벽
- API Key 관리 필요 → 사용자 설정 단계 추가

### 이 ADR에 의존하는 이슈
- #144 Plugin Feature Spec
- #146 Plugin Scaffold
- #147 OpenAPI Type Sync
- #151 Plugin HTTP Client
- #157 Backend CORS Middleware

---

## 5. 통신 계약 상세

### 표준 요청 헤더
```typescript
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${this.settings.apiKey}`,
  'X-VoiceVault-Client': 'obsidian-plugin/0.5.0',
};
```

### 표준 에러 응답 형식
```typescript
interface APIError {
  detail: string;     // 사람이 읽을 수 있는 에러 메시지
  code: string;       // 에러 코드 (AUTH_REQUIRED, NOT_FOUND, etc.)
  status: number;     // HTTP 상태 코드
}
```

### 재시도 정책
```typescript
// 지수 백오프: 1s → 2s → 4s (최대 3회)
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
// 재시도 대상: 429, 502, 503, 504
// 재시도 비대상: 400, 401, 403, 404 (클라이언트 오류)
```

---

*Closes #141*
