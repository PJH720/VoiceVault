# v0.5.0 Context Pack

이 문서는 `v0.5.0 - Obsidian Vault Integration Refactor` 마일스톤 실행을 위한 작업 맥락입니다.

- Milestone URL: `https://github.com/PJH720/VoiceVault/milestone/6`
- 상태: Open
- 목적: v1.0 Obsidian Community Plugin 전환 직전의 plugin-ready 기반 완성

## 1) 문제 정의

현재 VoiceVault는 Obsidian 호환 Markdown export는 가능하지만, Obsidian Plugin 런타임 관점의 구조/운영 규칙(수명주기, 뷰, 설정, 릴리즈 호환성, 보안 경계)이 분산되어 있습니다.

v0.5.0에서는 대규모 리팩토링을 수행하기 전에 다음을 고정합니다.

- Plugin-Backend 경계(책임과 계약)
- Vault 데이터 소유권(파일 vs DB)
- 보안/성능/릴리즈 정책
- 구현 착수 전 필수 문서 패키지

## 2) 범위 정의

### In Scope

- Obsidian plugin 표준 구조와 릴리즈 파이프라인 문서화
- OpenAPI 기반 타입 동기화 전략 명문화
- 최소 vertical slice(조회/검색/내보내기) 우선 구현 기준 확정
- 수명주기 정리 규칙(onload/onunload, event, interval) 체크리스트화
- 보안 규칙(innerHTML 회피, 경로 정규화, 안전한 파일 쓰기) 확정

### Out of Scope

- Community Plugin 제출/승인 완료
- 모바일 완성
- 백엔드 전면 재작성
- 모든 기능의 동시 포팅

## 3) 필수 산출물 (문서 우선)

다음 문서를 먼저 작성하고 구현을 시작합니다.

1. `docs/milestones/v0.5.0/v0.5.0-master-plan.md`
2. `docs/milestones/v0.5.0/ADR-001-plugin-backend-boundary.md`
3. `docs/milestones/v0.5.0/ADR-002-data-ownership-vault-vs-db.md`
4. `docs/milestones/v0.5.0/ADR-003-security-and-sandboxing.md`
5. `docs/milestones/v0.5.0/plugin-feature-spec.md`
6. `docs/milestones/v0.5.0/obsidian-ux-flow.md`
7. `docs/milestones/v0.5.0/v0.5.0-test-plan.md`
8. `docs/milestones/v0.5.0/v0.5.0-release-checklist.md`

## 4) Definition of Done

- 핵심 문서가 구현 기준으로 사용 가능하다.
- plugin-ready 구조에서 핵심 플로우 1개 이상 end-to-end 검증한다.
- 기존 REST/WebSocket 계약 회귀가 없다.
- 릴리즈 절차가 재현 가능하다.

## 5) 이슈 생성 가이드 (추천)

이 마일스톤 이슈는 아래 포맷으로 작성합니다.

- 제목: `[v0.5.0] <area>: <task>`
- 본문:
  - 배경/문제
  - 작업 범위(In/Out)
  - 구현/문서 체크리스트
  - 테스트 계획
  - 완료 조건(DoD)

예시 영역:

- `plugin-core`
- `vault-integration`
- `api-contract`
- `security`
- `performance`
- `docs`

## 6) 참고 링크

- `./reference-links.md`
