# Obsidian UX 플로우 설계

> **관련 이슈**: [#145](https://github.com/PJH720/VoiceVault/issues/145)  
> **의존**: plugin-feature-spec.md (#144)  
> **작성일**: 2026-02-25  
> **상태**: ✅ Accepted

---

## 개요

VoiceVault Obsidian Plugin의 전체 사용자 경험 흐름을 시각화합니다.  
핵심 4가지 플로우: **초기 설정 → 녹음 목록 조회 → RAG 검색 → Markdown 내보내기**

---

## 플로우 1: 최초 설정

```mermaid
flowchart TD
    A([Plugin 설치 완료]) --> B[Obsidian 재시작 / 활성화]
    B --> C{Backend 연결 테스트}
    C -->|실패| D[Notice 표시:\n'VoiceVault Backend 연결 불가']
    D --> E[Settings 패널 열기]
    E --> F[Backend URL 입력\n기본: http://localhost:8000]
    F --> G[API Key 입력 선택사항]
    G --> H[연결 테스트 버튼]
    H --> C
    C -->|성공| I[Notice: 'VoiceVault 연결됨' 3초]
    I --> J[Ribbon 아이콘 활성화 초록]
    J --> K([준비 완료])
```

**Obsidian UI 패턴 매핑**:
- `SettingTab` — Backend URL, API Key, 내보내기 폴더 설정
- `Notice` — 연결 성공/실패 피드백
- Ribbon icon 색상: 연결됨(초록) / 미연결(회색)

---

## 플로우 2: 녹음 목록 조회

```mermaid
flowchart TD
    A([Ribbon 아이콘 클릭]) --> B[VoiceVault ItemView 열림\n우측 사이드패널]
    B --> C[GET /api/v1/recordings\n최신순 20개]
    C --> D{응답}
    D -->|성공| E[녹음 카드 목록 표시\n제목, 날짜, 길이, 분류 유형]
    D -->|실패 401| F[Notice: API Key 확인\n+ 설정 링크]
    D -->|실패 연결 오류| G[Notice: Backend 연결 불가\n+ 재시도 버튼]
    E --> H{사용자 액션}
    H -->|필터 선택| I[분류 유형 / 날짜 범위 필터]
    I --> C
    H -->|카드 클릭| J[녹음 상세 Modal 열기]
    H -->|내보내기 아이콘| K[→ 플로우 4: 내보내기]
    H -->|더 보기| L[다음 20개 로드]
    J --> M[요약 텍스트 + 메타데이터 표시]
    M --> N{모달 내 액션}
    N -->|RAG 검색| O[→ 플로우 3: RAG 검색]
    N -->|Vault에 내보내기| K
    N -->|닫기| E
```

**Obsidian UI 패턴 매핑**:
- `ItemView` — 우측 사이드패널 (Leaf 기반)
- `Modal` — 녹음 상세 표시
- `createEl()` — 카드 DOM 구성 (innerHTML 금지)

---

## 플로우 3: RAG 자연어 검색

```mermaid
flowchart TD
    A([검색 진입\nCommand Palette: VoiceVault: RAG 검색]) --> B[검색 Modal 열기]
    B --> C[쿼리 입력박스 표시\n멀티라인 textarea]
    C --> D{선택적 필터}
    D --> E[날짜 범위 선택 선택]
    D --> F[분류 유형 선택 선택]
    E & F --> G[검색 버튼]
    G --> H{쿼리 유효성}
    H -->|빈 문자열| I[버튼 비활성화 유지]
    H -->|유효| J[POST /api/v1/rag/query\nSpinner 표시 + 60초 타임아웃]
    J --> K{응답}
    K -->|성공| L[답변 텍스트 표시\nMarkdown 렌더링]
    L --> M[출처 목록 표시\n최대 5개 유사도 점수 포함]
    M --> N{출처 클릭}
    N --> O[ItemView에서 해당 녹음 강조\n또는 관련 Vault 파일 열기]
    K -->|타임아웃| P[Notice: 응답 시간 초과\n쿼리 단순화 안내]
    K -->|오류| Q[오류 메시지 표시\n재시도 버튼]
```

**Obsidian UI 패턴 매핑**:
- `Modal` — 검색 입력 및 결과 표시
- `MarkdownRenderer.renderMarkdown()` — 답변 텍스트 렌더링
- `Command` (Command Palette) — `this.addCommand()` 등록

---

## 플로우 4: Obsidian Markdown 내보내기

```mermaid
flowchart TD
    A([내보내기 진입\n녹음 카드 컨텍스트 메뉴 또는 아이콘]) --> B{단일 vs 배치}
    
    B -->|단일 선택| C[POST /api/v1/recordings/:id/export\nmarkdown 콘텐츠 수신]
    B -->|다중 선택| D[배치 내보내기 진행 상태 표시\n순차 처리]
    
    C --> E{기존 파일 존재?}
    D --> E
    
    E -->|없음| F[app.vault.create 새 파일 생성]
    E -->|있음| G[Modal: 덮어쓰기 확인\n'파일이 이미 존재합니다']
    G -->|덮어쓰기| H[app.vault.modify 기존 파일 수정]
    G -->|취소| I([취소])
    
    F & H --> J{성공}
    J -->|성공| K[Notice: 'OOO.md를 Vault에 저장했습니다']
    K --> L[파일 열기 링크 제공]
    J -->|실패| M[Notice: '내보내기 실패: 오류 메시지']
    
    L --> N{사용자 선택}
    N -->|파일 열기| O[Obsidian에서 .md 파일 오픈]
    N -->|닫기| P([완료])
```

**Obsidian UI 패턴 매핑**:
- `app.vault.create()` / `app.vault.modify()` — Vault 파일 쓰기
- `normalizePath()` — 경로 정규화 (ADR-003 §2.2)
- `Modal` — 덮어쓰기 확인 다이얼로그
- `Notice` — 성공/실패 피드백

---

## 전체 사용자 여정 요약

```mermaid
journey
    title VoiceVault Obsidian Plugin 사용자 여정
    section 초기 설정
      Plugin 설치: 5: 사용자
      Backend URL 입력: 4: 사용자
      연결 성공 확인: 5: 사용자
    section 일상 사용
      Ribbon 아이콘으로 목록 열기: 5: 사용자
      날짜별 녹음 탐색: 4: 사용자
      RAG로 궁금한 것 검색: 5: 사용자
      핵심 녹음 Vault에 저장: 5: 사용자
    section 고급 사용
      배치 내보내기: 3: 사용자
      필터로 특정 분류 탐색: 4: 사용자
```

---

## Obsidian 네이티브 진입점 매핑

| 진입점 | 구현 방법 | 연결 플로우 |
|--------|-----------|------------|
| Ribbon 아이콘 (마이크) | `this.addRibbonIcon('microphone', ...)` | 플로우 2: 녹음 목록 |
| Command Palette | `this.addCommand({ id: 'rag-search', ... })` | 플로우 3: RAG 검색 |
| 파일 컨텍스트 메뉴 | `this.registerEvent(app.workspace.on('file-menu', ...))` | 플로우 4: 내보내기 |
| 설정 탭 | `this.addSettingTab(new VoiceVaultSettingTab(...))` | 플로우 1: 설정 |
| Status Bar | `this.addStatusBarItem()` | Backend 연결 상태 표시 |

---

## plugin-feature-spec과 일관성 확인

- [x] Feature 1 (녹음 목록 조회): 플로우 2 커버
- [x] Feature 2 (RAG 검색): 플로우 3 커버
- [x] Feature 3 (Markdown 내보내기): 플로우 4 커버
- [x] Health Check 흐름: 플로우 1에 통합
- [x] 오프라인 동작: 각 플로우의 실패 분기에 표현
- [x] ADR-003 보안 규칙: `normalizePath`, `createEl`, `app.vault.create` 명시

---

*Closes #145*
