---
name: Plan 01 - App Foundation and Audio Recording
overview: VoiceVault 1단계 범위인 앱 셸, 마이크 녹음, 로컬 저장, 라이브러리 조회, 오디오 재생, 기본 테스트 게이트를 완료하기 위한 실행 플랜입니다.
todos:
  - id: app-foundation
    content: Electron 앱 셸/보안 설정/기본 네비게이션 구조를 안정적으로 구성한다.
    status: completed
  - id: recording-pipeline
    content: 마이크 권한 요청부터 녹음 시작-중지-파일 저장까지 캡처 파이프라인을 구현한다.
    status: completed
  - id: persistence-library
    content: SQLite 기반 recordings 저장소와 라이브러리 목록/검색/삭제 UX를 구현한다.
    status: completed
  - id: playback-ux
    content: 녹음 상세 화면 재생/일시정지/시크/배속 제어를 구현한다.
    status: completed
  - id: test-gate
    content: Unit 및 E2E 스모크 테스트를 추가하고 핵심 플로우를 검증한다.
    status: completed
isProject: true
---

# Plan 01: App Foundation & Audio Recording (Concise)

**Phase:** 1 - Core App
**Priority:** P0
**Effort:** ~2 weeks
**Prerequisites:** None

## Overview

VoiceVault 1단계 목표는 데스크톱 앱 기본 구조, 마이크 녹음, 로컬 저장, 라이브러리 조회, 오디오 재생까지 한 사이클을 안정적으로 완성하는 것이다.
구현 경계는 `main`(네이티브/DB/IPC), `preload`(안전 브리지), `renderer`(UI)로 분리한다.

## Scope

- Electron + React + TypeScript 앱 구동
- 마이크 녹음 시작/중지 및 `.wav` 파일 저장
- SQLite 메타데이터 CRUD
- 라이브러리 목록/검색/상세/삭제
- 재생/일시정지/시크/배속 제어
- Unit + E2E 스모크 테스트

## Out of Scope

- 실시간 전사/요약
- 화자 분리
- RAG 검색
- 고급 내보내기
- 시스템 오디오 캡처

## Architecture Snapshot

### Main (`src/main`)

- `index.ts`: 창/트레이/보안 설정
- `services/AudioCaptureService.ts`: `native-audio-node` 래핑
- `services/DatabaseService.ts`: `better-sqlite3` 초기화 및 CRUD
- `ipc/audio.ts`, `ipc/database.ts`: 채널 핸들러
- `store.ts`: 로컬 설정

### Preload (`src/preload`)

- `index.ts`: `contextBridge`로 허용된 API만 노출

### Renderer (`src/renderer`)

- `App.tsx`: 사이드바 기반 화면 전환
- `components/Recording/`*: 녹음 화면 + 파형
- `components/Library/`*: 목록/상세/삭제
- `hooks/useRecording.ts`, `hooks/useAudioPlayer.ts`

### Shared (`src/shared`)

- `types.ts`: `Recording`, `RecordingResult`, `AudioLevelEvent`
- `ipc-channels.ts`: 채널 상수

## Implementation Workstreams

### 1) App Foundation

#### 산출물 (App Foundation)

- 앱 초기 구동, 사이드바 화면 전환
- `contextIsolation`/`sandbox`/CSP 적용
- 트레이에서 빠른 녹음 진입

#### 주요 파일 (App Foundation)

- `electron.vite.config.ts`
- `forge.config.ts`
- `src/main/index.ts`
- `src/renderer/App.tsx`
- `src/renderer/index.html`

#### 검증 (App Foundation)

- `pnpm dev`로 앱 실행
- Library/Record/Settings 전환 확인
- Renderer 직접 IPC 접근 금지 확인

### 2) Recording Pipeline

#### 산출물 (Recording Pipeline)

- 권한 요청 후 녹음 시작/중지
- 파형용 레벨 이벤트 스트리밍
- 실패 시 임시 파일 정리

#### 주요 파일 (Recording Pipeline)

- `src/main/services/AudioCaptureService.ts`
- `src/main/ipc/audio.ts`
- `src/preload/index.ts`
- `src/renderer/contexts/RecordingContext.tsx`
- `src/renderer/hooks/useRecording.ts`
- `src/renderer/components/Recording/RecordingView.tsx`
- `src/renderer/components/ui/Waveform.tsx`

#### 검증 (Recording Pipeline)

- 첫 녹음 권한 흐름 정상
- Stop 시 `.wav` 생성
- 중복 녹음 시작 방지

### 3) Persistence & Library

#### 산출물 (Persistence & Library)

- `recordings` 테이블/인덱스 준비
- 녹음 메타데이터 CRUD
- 목록/검색/삭제(파일 + DB 동기화)

#### 주요 파일 (Persistence & Library)

- `src/main/services/DatabaseService.ts`
- `src/main/ipc/database.ts`
- `src/shared/types.ts`
- `src/renderer/components/Library/LibraryView.tsx`
- `src/renderer/components/Library/RecordingRow.tsx`
- `src/renderer/components/Library/RecordingDetail.tsx`

#### 검증 (Persistence & Library)

- 저장 직후 목록 반영
- 제목 검색 동작
- 삭제 시 파일 + row 동시 제거

### 4) Playback UX

#### 산출물 (Playback UX)

- 재생/일시정지/시크/배속(0.5x/1x/1.5x/2x)
- 현재 시간/총 길이 표시

#### 주요 파일 (Playback UX)

- `src/renderer/hooks/useAudioPlayer.ts`
- `src/renderer/components/Library/RecordingDetail.tsx`

#### 검증 (Playback UX)

- UI 상태와 재생 상태 일치
- 종료 시 상태 정리

### 5) Test Gate

#### 산출물 (Test Gate)

- 서비스 중심 Unit 테스트
- 앱 런치/핵심 흐름 E2E 스모크

#### 주요 파일 (Test Gate)

- `tests/unit/DatabaseService.test.ts`
- `tests/unit/AudioCaptureService.test.ts`
- `tests/e2e/app-launch.test.ts`

#### 검증 (Test Gate)

- Unit: DB CRUD, 캡처 생명주기
- E2E: 런치, 네비게이션, 기본 녹음 플로우

## Data & IPC Contract

### Database (required)

```sql
CREATE TABLE recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  duration REAL NOT NULL DEFAULT 0,
  audio_path TEXT NOT NULL,
  category TEXT,
  is_bookmarked INTEGER NOT NULL DEFAULT 0,
  file_size_bytes INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_recordings_created_at ON recordings(created_at);
CREATE INDEX idx_recordings_category ON recordings(category);
```

### IPC Channels (required)

- `audio:start-recording`
- `audio:stop-recording`
- `audio:request-permission`
- `audio:get-levels`
- `db:recordings:list`
- `db:recordings:get`
- `db:recordings:update`
- `db:recordings:delete`

## Acceptance Criteria

- 앱 구동 및 사이드바 전환 가능
- Record/Stop으로 파일 저장 + DB insert 완료
- 녹음 중 파형 표시
- 저장 직후 Library 목록 반영 및 검색 가능
- 상세 화면에서 재생/일시정지/시크/배속 가능
- 삭제 시 파일 + DB 동시 삭제
- `contextBridge` 기반 API만 사용
- TypeScript strict 위반 없음
- Unit/E2E 스모크 통과

## Risks & Edge Cases

- macOS 권한 미처리 시 무음 녹음 실패
- Linux 오디오 백엔드 차이로 캡처 변동 가능
- 장시간 녹음에서 메모리/파일 크기 이슈
- 녹음 중 비정상 종료 시 부분 파일 잔존 가능
- 네트워크 드라이브에서 WAL 제약 가능

## Assumptions

- 상세 코딩 규칙은 `CLAUDE.md`와 `.cursor/rules/*`를 기준으로 한다.
- 본 문서는 구현 범위와 완료 기준 중심의 요약 문서다.

