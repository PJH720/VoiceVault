---
name: Concise Plan Rewrite
overview: "`01-app-shell-audio-recording.md`를 동일 범위/목표는 유지하면서 중복과 과도한 코드 예시를 제거해 읽기 쉬운 요약형 실행 플랜으로 재구성합니다."
todos:
  - id: audit-duplication
    content: 기존 플랜의 중복/비핵심 섹션을 식별하고 제거 기준을 적용한다.
    status: completed
  - id: rewrite-structure
    content: 9단계 구현 절차를 4~5개 워크스트림 중심의 축약 구조로 재작성한다.
    status: completed
  - id: trim-criteria-risks
    content: 수용 기준과 리스크를 중복 없이 핵심 항목만 남겨 정리한다.
    status: completed
  - id: final-pass
    content: 길이, 가독성, 실행 가능성 기준으로 최종 교정한다.
    status: completed
isProject: false
---

# Plan 01 축약 재작성 계획

## 목표

기존 `[.cursor/plans/01-app-shell-audio-recording.md](/Users/pj/dev/VoiceVault/.cursor/plans/01-app-shell-audio-recording.md)`의 기능 범위(앱 셸 + 녹음 + 저장 + 재생 + 기본 테스트)는 유지하고, 문서 길이와 중복을 크게 줄인 `Cursor` 친화적 실행 플랜으로 재작성합니다.

## 편집 원칙

- 범위 유지: 기존 Phase 1 목표/수용 기준은 유지
- 길이 축소: 장문 코드 블록, 환경/정책 중복 설명 제거
- 참조 우선: 프로젝트 공통 규칙은 `[CLAUDE.md](/Users/pj/dev/VoiceVault/CLAUDE.md)`와 `.cursor/rules`를 참조하고 재서술 최소화
- 실행성 유지: 각 단계에 `핵심 산출물`, `주요 파일`, `검증 포인트`를 남김

## 재구성 구조

- `Overview` (2~4문장)
- `Scope` / `Out of Scope`
- `Architecture Snapshot` (프로세스별 핵심 컴포넌트만)
- `Implementation Workstreams` (현재 1~~9 단계를 4~~5개 스트림으로 통합)
  - 앱 셸/윈도우
  - 녹음 파이프라인
  - DB/라이브러리
  - 재생/UI
  - 테스트/검증
- `Acceptance Criteria` (중복 항목 병합)
- `Risks & Edge Cases` (핵심 5~7개만)
- `Open Questions/Assumptions` (필요 시)

## 섹션별 축약 포인트

- **Architecture/Implementation 중복 제거**: 동일 파일 목록 반복 기술 삭제
- **대형 코드 블록 제거**: preload 예시/훅 구현 전문은 요약 bullets로 대체
- `**New Files` 트리 단순화**: 변경 핵심 디렉터리만 기재
- `**Database Schema`/`UI Components` 최소화**: 핵심 컬럼/컴포넌트 책임만 유지
- **공통 가이드 제거**: i18n/보안/패키징 일반론은 플랜에서 삭제하고 기준 문서로 링크

## 결과물 기준

- 단일 파일 수정: `[.cursor/plans/01-app-shell-audio-recording.md](/Users/pj/dev/VoiceVault/.cursor/plans/01-app-shell-audio-recording.md)`
- 예상 길이: 기존 대비 약 50~70% 축소
- 읽기 시간: 5~8분 내 전체 이해 가능
- 실행 가능성: 각 스트림별로 바로 구현 착수 가능한 수준 유지

