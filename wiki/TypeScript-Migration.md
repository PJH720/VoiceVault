# TypeScript 단독 도입 이점 — VoiceVault 프론트엔드 마이그레이션

**문서 작성일**: 2026-02-15  
**목적**: Streamlit → React/Next.js + TypeScript 전환 시 얻는 이점 정리  
**마일스톤**: v0.4.0 ([Roadmap](Roadmap) 참고)

---

## 1. 개요

VoiceVault는 현재 **Python 단일 스택**으로 구성되어 있다. 백엔드(FastAPI)와 프론트엔드(Streamlit) 모두 Python으로 작성되어 있어, 프로토타이핑에는 유리하지만 **실시간 오디오 처리**, **WebSocket 기반 실시간 UI**, **Obsidian 플러그인 전환** 등에서 한계가 있다.

이 문서는 **TypeScript 단독 도입(런타임은 JavaScript)** 시 얻는 이점을 정리한다.

---

## 2. 핵심 이점 요약

| 순위 | 이점 | 영향도 | VoiceVault 적용 |
|------|------|--------|-----------------|
| 1 | Web Audio API 네이티브 접근 | 매우 높음 | 실시간 PCM 스트리밍, 오디오 파형 시각화 |
| 2 | Obsidian 플러그인 코드 재사용 | 높음 | v1.0 전환 시 UI 컴포넌트 그대로 활용 |
| 3 | 반응형 + 실시간 UI | 높음 | Streamlit 전체 리렌더 한계 탈피 |
| 4 | 타입 안전성 (TypeScript) | 높음 | API 계약 보장, 런타임 에러 감소 |
| 5 | 풍부한 UI/UX 생태계 | 중간 | wavesurfer.js, vis-timeline, PWA 등 |
| 6 | 오프라인 지원 (PWA) | 중간 | 녹음 후 동기화 가능 |
| 7 | 테스트 생태계 | 중간 | Jest, Playwright, Vitest |

---

## 3. 상세 이점

### 3.1 Web Audio API 네이티브 접근

- **브라우저 표준**: `Web Audio API`, `MediaRecorder API`는 JavaScript 런타임 네이티브
- **Streamlit 한계**: 오디오 녹음을 위해 hacky한 workaround 필요
- **TypeScript 도입 시**: `AudioContext`, `AudioWorklet`을 타입 안전하게 활용 가능
- **WebSocket 연동**: 실시간 오디오 청크 전송이 프레임워크 수준에서 지원

```typescript
// 예: Web Audio API 기반 PCM 캡처 (TypeScript)
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const audioContext = new AudioContext({ sampleRate: 16000 });
const source = audioContext.createMediaStreamSource(stream);
// ... ScriptProcessorNode 또는 AudioWorklet으로 PCM 추출
```

### 3.2 WebSocket 실시간 UI 업데이트

- **Streamlit**: 전체 스크립트를 매번 재실행 → 실시간 트랜스크립션 표시에 부적합
- **React + WebSocket**: 컴포넌트 단위 부분 업데이트 가능
- **UX**: 타이핑 중인 트랜스크립트가 한 글자씩 나타나는 경험 구현 가능

### 3.3 타입 안전성 (TypeScript)

- **API 계약**: Python Pydantic 모델 ↔ TypeScript `interface` 동기화
- **도구**: OpenAPI spec → `openapi-typescript` 등으로 자동 생성
- **효과**: 런타임 타입 에러 대폭 감소, IDE 자동완성 강화

```typescript
// Python Pydantic 모델과 1:1 매핑
interface RecordingSummary {
  id: number;
  recording_id: number;
  minute_index: number;
  summary_text: string;
  keywords: string[];
  confidence: number;
}
```

### 3.4 풍부한 UI/UX 생태계

| 기능 | Streamlit (현재) | React/Next.js (도입 시) |
|------|-----------------|------------------------|
| 오디오 파형 시각화 | 불가능 | wavesurfer.js, Tone.js |
| 타임라인 UI | 기본 슬라이더 | vis-timeline, 커스텀 D3.js |
| 드래그 & 드롭 | 제한적 | 네이티브 지원 |
| 반응형 레이아웃 | 고정 폭 | Tailwind CSS, 자유 레이아웃 |
| 다크 모드 | 테마 제한 | 완전 커스텀 |
| 모바일 대응 | 거의 불가 | 반응형 완전 지원 |
| 키보드 단축키 | 불가 | 완전 지원 |

### 3.5 Obsidian 플러그인 직접 호환

- **Obsidian 플러그인**: TypeScript로 작성해야 함
- **코드 재사용**: TypeScript 기반 프론트엔드 → Obsidian 플러그인 전환 시 UI 로직 재사용
- **현재**: Streamlit → Obsidian 플러그인 전환 시 모든 UI 코드를 처음부터 재작성해야 함

### 3.6 성능 최적화

- **클라이언트 사이드 오디오 전처리**: PCM 변환, 리샘플링, 노이즈 필터링을 브라우저에서 수행 → 서버 부하 감소
- **SSR/SSG** (Next.js): 초기 로딩 속도 개선
- **코드 스플리팅**: 녹음 페이지, RAG 검색 페이지 등 필요한 JS만 로드
- **Web Worker**: 무거운 오디오 처리를 메인 스레드와 분리 → UI 멈춤 없음

### 3.7 오프라인 지원 (PWA)

- **Service Worker + IndexedDB**: 오프라인 녹음 후 나중에 동기화 가능
- **Streamlit**: 서버 연결이 끊기면 완전 동작 불가

### 3.8 테스트 생태계

- **Jest, Vitest**: 단위/통합 테스트
- **Playwright, Cypress**: E2E 브라우저 테스트
- **컴포넌트 테스트**: Storybook + Testing Library

---

## 4. 기술 스택 권장

| 영역 | 권장 | 대안 | 비고 |
|------|------|------|------|
| 프레임워크 | Next.js 14 (App Router) | React + Vite | SSR, 라우팅, API Routes |
| 언어 | TypeScript (단독) | — | 신규 .js/.jsx 소스 지양 |
| 스타일 | Tailwind CSS | CSS Modules | 빠른 UI 개발 |
| 상태 관리 | React Query + Zustand | Redux, Jotai | 서버 상태 vs 클라이언트 상태 |
| API 클라이언트 | fetch + openapi-typescript | axios, SWR | 타입 자동 생성 |
| 오디오 | Web Audio API + MediaRecorder | — | 브라우저 표준 |
| 테스트 | Vitest + Playwright | Jest, Cypress | Vite 생태계 친화 |

---

## 5. 마이그레이션 시 고려사항

### 5.1 점진적 전환

- **Phase 1**: `backend/` 분리 (Python 그대로, 경로만 이동)
- **Phase 2**: `frontend/` 초기화 (Next.js + TypeScript)
- **Phase 3**: 페이지별 마이그레이션 (Recording → Summaries → RAG → Export → Templates)
- **Phase 4**: Streamlit 제거, Docker/README 업데이트

### 5.2 API 호환성

- **기존 FastAPI 엔드포인트 유지**: 프론트엔드만 교체
- **OpenAPI spec**: `GET /openapi.json` 활용 → TypeScript 타입 자동 생성
- **WebSocket**: `/ws/transcribe` 프로토콜 변경 없음

### 5.3 의존성 관리

- **Python**: `uv` + `pyproject.toml` (backend)
- **Node**: `pnpm` 또는 `npm` + `package.json` (frontend)
- **Monorepo**: 루트에 `package.json` workspace 또는 단순 분리

### 5.4 v0.4.0 반영 결정사항

이번 리팩토링 마일스톤(v0.4.0)에서는 아래 항목을 우선 적용한다.

- **우선 전환 화면**: Recording, Summaries
- **백엔드 로직 유지**: FastAPI/Service 레이어는 기능 변경 없이 구조만 분리
- **언어 정책 확정**: 프론트엔드 소스는 TypeScript 단독(`.ts/.tsx`)으로 작성
- **타입 계약 도입**: OpenAPI → TypeScript 타입 자동 생성 파이프라인
- **점진적 제거 전략**: Streamlit은 병행 운영 후 제거

---

## 6. 참고 자료

- [Web Audio API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [MediaRecorder API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [Obsidian Plugin API](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [openapi-typescript](https://github.com/drwpow/openapi-typescript)
- [Next.js Documentation](https://nextjs.org/docs)

---

## 관련 문서

- [Refactoring Plan](Refactoring-Plan) — 전체 리팩토링 계획
- [Roadmap](Roadmap) — v0.4.0 마일스톤 상세
- [Architecture](Architecture) — 기존 기술 아키텍처
