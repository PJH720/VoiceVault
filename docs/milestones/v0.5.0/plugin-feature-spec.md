# Plugin Feature Spec — v0.5.0 최소 기능 명세

> **관련 이슈**: [#144](https://github.com/PJH720/VoiceVault/issues/144)  
> **의존**: ADR-001 (Plugin-Backend 경계), ADR-002 (데이터 소유권)  
> **작성일**: 2026-02-25  
> **상태**: ✅ Accepted

---

## 개요

v0.5.0 Plugin이 구현할 **최소 vertical slice**: 3가지 핵심 기능

| # | 기능 | 우선순위 | API |
|---|------|----------|-----|
| 1 | 녹음 목록 조회 | P0 | `GET /api/v1/recordings` |
| 2 | RAG 자연어 검색 | P0 | `POST /api/v1/rag/search` |
| 3 | Obsidian Markdown 내보내기 | P0 | `POST /api/v1/export` |

이 3가지가 동작하면 "Plugin으로 VoiceVault를 완전히 사용할 수 있는 최소 경험"이 완성됩니다.

---

## Feature 1: 녹음 목록 조회

### 사용자 스토리
> "Obsidian 내에서 지난 녹음 목록을 보고 원하는 녹음을 선택하고 싶다."

### UI 구성
- **진입점**: Ribbon icon(마이크) 클릭 → `ItemView` 우측 패널 열림
- **목록 표시**: 녹음 카드 (제목, 날짜, 길이, 분류 유형, 신뢰도)
- **검색 필터**: 날짜 범위, 분류 유형(강의/대화/메모/기타)
- **정렬**: 최신순 기본, 날짜 오름차순 선택 가능
- **페이지네이션**: 20개씩, "더 보기" 버튼

### API 연동
```
GET /api/v1/recordings?page=1&limit=20&sort=desc&type=강의
→ { recordings: Recording[], total: number, page: number }
```

### TypeScript 인터페이스
```typescript
interface Recording {
  id: string;
  title: string;
  date: string;           // ISO 8601
  duration_minutes: number;
  classification_type: '강의' | '대화' | '메모' | '기타' | null;
  confidence: number | null;
  summary_preview: string; // 요약 첫 100자
}

interface RecordingsResponse {
  recordings: Recording[];
  total: number;
  page: number;
  limit: number;
}
```

### 에러 시나리오
| 상황 | Plugin 동작 |
|------|-------------|
| Backend 미연결 | Notice("VoiceVault Backend에 연결할 수 없습니다") + 재연결 버튼 |
| 빈 목록 | "아직 녹음이 없습니다. VoiceVault 앱에서 녹음을 시작하세요." |
| 인증 실패(401) | Notice("API Key를 확인하세요") + 설정으로 이동 링크 |
| 서버 오류(5xx) | Notice("서버 오류. Backend 로그를 확인하세요.") |

---

## Feature 2: RAG 자연어 검색

### 사용자 스토리
> "Obsidian에서 '지난 달 강의에서 LangChain에 대해 뭐라고 했지?'를 입력하면, 관련 녹음과 출처를 함께 답변받고 싶다."

### UI 구성
- **진입점**: Command Palette → `VoiceVault: RAG 검색` 또는 검색 아이콘
- **입력**: 자연어 쿼리 텍스트박스 (멀티라인)
- **필터**: 날짜 범위, 분류 유형 (선택)
- **결과**: 
  - 답변 텍스트 (Markdown 렌더링)
  - 출처 목록 (최대 5개): 녹음 제목, 날짜, 관련 구절
  - 각 출처 클릭 → 해당 Vault .md 파일 열기 (또는 목록 뷰로 이동)
- **로딩 상태**: 스피너 + "검색 중..." (최대 60초)

### API 연동
```
POST /api/v1/rag/search
Body: { query: string, top_k: number, date_from?: string, date_to?: string }
→ { answer: string, sources: Source[], query_time_ms: number }
```

### TypeScript 인터페이스
```typescript
interface RAGSearchRequest {
  query: string;
  top_k?: number;       // 기본값: 5
  date_from?: string;   // ISO 8601
  date_to?: string;
  type_filter?: string; // '강의' | '대화' | '메모' | '기타'
}

interface Source {
  recording_id: string;
  recording_title: string;
  recording_date: string;
  relevant_text: string;  // 관련 구절 (최대 200자)
  similarity_score: number;
}

interface RAGSearchResponse {
  answer: string;
  sources: Source[];
  query_time_ms: number;
}
```

### 에러 시나리오
| 상황 | Plugin 동작 |
|------|-------------|
| 쿼리 빈 문자열 | 제출 버튼 비활성화 |
| 타임아웃(60초) | Notice("응답 시간 초과. 쿼리를 단순화하거나 나중에 다시 시도하세요.") |
| ChromaDB 인덱스 없음(404) | Notice("검색 인덱스가 비어 있습니다. 녹음 후 다시 시도하세요.") |
| 결과 없음 | "관련 녹음을 찾을 수 없습니다." |

---

## Feature 3: Obsidian Markdown 내보내기

### 사용자 스토리
> "녹음 목록에서 특정 녹음을 선택하고 '내보내기'를 누르면, YAML frontmatter와 wikilinks가 포함된 Obsidian 호환 .md 파일이 Vault에 생성되길 원한다."

### UI 구성
- **진입점**: 녹음 카드 우클릭 메뉴 → `Vault에 내보내기` 또는 카드 내 아이콘
- **단일 내보내기**: 선택 → 미리보기 Modal → `Vault에 저장` 버튼
- **배치 내보내기**: 여러 카드 선택(체크박스) → `선택 항목 내보내기` → 진행 상태 표시
- **저장 경로**: ADR-002의 `VoiceVault/Recordings/YYYY-MM-DD/[분류] 제목 - HH:MM.md`
- **덮어쓰기 경고**: 기존 파일이 있을 경우 확인 Dialog

### API 연동
```
POST /api/v1/export
Body: { recording_id: string, options?: ExportOptions }
→ { markdown: string, filename: string, frontmatter: Frontmatter }

POST /api/v1/export/batch
Body: { recording_ids: string[], options?: ExportOptions }
→ { results: ExportResult[] }
```

### TypeScript 인터페이스
```typescript
interface ExportOptions {
  include_transcript: boolean;  // 전사 본문 포함 여부 (기본: true)
  include_wikilinks: boolean;   // RAG 기반 관련 문서 wikilinks (기본: true)
  folder_structure: 'date' | 'type' | 'flat';  // 폴더 구조 (기본: 'date')
}

interface ExportResult {
  recording_id: string;
  success: boolean;
  markdown?: string;
  filename?: string;
  error?: string;
}

// Frontmatter 스키마 (ADR-002 §2.4 기반)
interface Frontmatter {
  id: string;
  title: string;
  date: string;
  time: string;
  duration_minutes: number;
  type: string;
  speakers: string[];
  keywords: string[];
  confidence: number | null;
  tags: string[];
  related: string[];            // [[wikilinks]]
  created_by: string;
  exported_at: string;
  source_db_id: number;
}
```

### 에러 시나리오
| 상황 | Plugin 동작 |
|------|-------------|
| Vault 쓰기 권한 없음 | Notice("Vault에 파일을 쓸 수 없습니다. 권한을 확인하세요.") |
| 기존 파일 존재 | Modal("이미 파일이 존재합니다. 덮어쓰시겠습니까?") [덮어쓰기 / 취소] |
| 녹음 처리 미완료 | Notice("이 녹음은 아직 처리 중입니다. 잠시 후 다시 시도하세요.") |
| 배치 부분 실패 | Notice("3개 중 2개 내보내기 성공. 실패 항목: ...")  |

---

## Plugin 설정 (SettingTab)

| 설정 키 | 타입 | 기본값 | 설명 |
|---------|------|--------|------|
| `backendUrl` | string | `http://localhost:8000` | Backend API URL |
| `apiKey` | string | `""` | 인증 토큰 (선택) |
| `exportFolder` | string | `VoiceVault/Recordings` | Vault 내 내보내기 기본 폴더 |
| `folderStructure` | 'date' \| 'type' \| 'flat' | `'date'` | 폴더 구조 규칙 |
| `includeTranscript` | boolean | `true` | 내보내기 시 전사 포함 |
| `includeWikilinks` | boolean | `true` | wikilinks 자동 생성 |
| `autoExportOnStop` | boolean | `false` | 녹음 종료 시 자동 내보내기 |

---

## Health Check 흐름

Plugin 로드(`onload`) 시 자동 실행:

```
Plugin 로드
    │
    ├── GET /api/v1/health
    │       │
    │       ├── 200 OK → Ribbon icon 활성화 (초록)
    │       │            Notice("VoiceVault 연결됨") [3초 후 자동 닫힘]
    │       │
    │       └── 실패 → Ribbon icon 비활성화 (회색)
    │                   Notice("VoiceVault Backend에 연결할 수 없습니다.\n설정에서 URL을 확인하세요.")
    │
    └── 30초마다 health check 반복 (registerInterval)
```

---

## 구현 기준 일치 확인

- [ ] ADR-001 §2.3 API 엔드포인트 목록과 일치
- [ ] ADR-001 §2.4 오프라인 동작 전략 반영
- [ ] ADR-002 §2.4 Frontmatter 스키마와 일치
- [ ] ADR-003 §2.1 DOM 보안 규칙 준수 (createEl 사용)
- [ ] ADR-003 §2.4 requestUrl 사용

---

*Closes #144*
