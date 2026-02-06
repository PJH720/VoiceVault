# (1)
# GitHub 이슈/PR 라벨 추천

GitHub 기본 라벨(`bug`, `documentation`, `duplicate`, `enhancement`, `good first issue`, `help wanted`, `invalid`, `question`, `wontfix`)만으로는 프로젝트 관리가 부족할 수 있습니다. 아래에 카테고리별로 유용한 라벨들을 소개합니다.

---

## 1. 우선순위 (Priority)

| 라벨 | 색상 (추천) | 설명 |
|---|---|---|
| `priority: critical` | `#e11d48` (빨강) | 즉시 해결 필요 |
| `priority: high` | `#f97316` (주황) | 높은 우선순위 |
| `priority: medium` | `#eab308` (노랑) | 중간 우선순위 |
| `priority: low` | `#22c55e` (초록) | 낮은 우선순위 |

## 2. 상태 (Status)

| 라벨 | 색상 (추천) | 설명 |
|---|---|---|
| `status: in progress` | `#3b82f6` (파랑) | 작업 중 |
| `status: review needed` | `#a855f7` (보라) | 리뷰 대기 |
| `status: blocked` | `#ef4444` (빨강) | 다른 작업에 의해 차단됨 |
| `status: on hold` | `#6b7280` (회색) | 보류 중 |
| `status: ready` | `#10b981` (초록) | 작업 시작 가능 |

## 3. 타입 (Type)

| 라벨 | 색상 (추천) | 설명 |
|---|---|---|
| `type: feature` | `#06b6d4` (시안) | 새로운 기능 |
| `type: bug` | `#ef4444` (빨강) | 버그 수정 (기본 `bug`과 통합 가능) |
| `type: refactor` | `#8b5cf6` (보라) | 코드 리팩토링 |
| `type: chore` | `#6b7280` (회색) | 설정, 의존성 업데이트 등 잡무 |
| `type: design` | `#ec4899` (핑크) | UI/UX 디자인 관련 |
| `type: test` | `#14b8a6` (틸) | 테스트 추가/수정 |
| `type: hotfix` | `#dc2626` (진한 빨강) | 긴급 수정 |

## 4. 범위/영역 (Scope)

| 라벨 | 색상 (추천) | 설명 |
|---|---|---|
| `scope: frontend` | `#60a5fa` (밝은 파랑) | 프론트엔드 관련 |
| `scope: backend` | `#34d399` (밝은 초록) | 백엔드 관련 |
| `scope: database` | `#f59e0b` (앰버) | DB 관련 |
| `scope: infra` | `#9ca3af` (회색) | 인프라/DevOps 관련 |
| `scope: api` | `#818cf8` (인디고) | API 관련 |

## 5. 기타 유용한 라벨

| 라벨 | 색상 (추천) | 설명 |
|---|---|---|
| `needs discussion` | `#fbbf24` (노랑) | 논의 필요 |
| `breaking change` | `#b91c1c` (어두운 빨강) | 하위 호환성 깨지는 변경 |
| `dependencies` | `#0e8a16` (초록) | 의존성 관련 |
| `do not merge` | `#e11d48` (빨강) | 아직 머지하면 안 됨 |
| `stale` | `#d1d5db` (연회색) | 오래된/방치된 이슈 |

---

## 팁

- **접두사 패턴** (`priority:`, `status:`, `type:`, `scope:`)을 사용하면 라벨이 많아져도 필터링이 편합니다.
- **같은 카테고리는 같은 계열 색상**으로 통일하면 시각적으로 구분이 쉽습니다.
- 프로젝트 규모에 따라 필요한 것만 골라서 쓰는 게 좋습니다. 러너톤 같은 단기 프로젝트라면 **우선순위 + 타입 + 상태** 정도면 충분할 수 있습니다.

필요한 라벨을 골라주시면, `gh label create` 명령어로 일괄 생성하는 스크립트도 안내해 드릴 수 있습니다.

# (2)
# Sprint Backlog 이슈 템플릿 제안

---

## 기본 정보

| 항목 | 값 |
|---|---|
| **Template name** | `Sprint Backlog` |
| **About** | 백로그 생성을 위한 이슈 템플릿 |
| **Labels** | `type: backlog`, `status: ready` |
| **Title prefix** | `[Backlog] ` |

---

## Labels 설명

- **`type: backlog`** — 이 이슈가 스프린트 백로그 항목임을 나타냄
- **`status: ready`** — 작업 시작 가능한 상태 표시 (필요 시 `status: in progress` 등으로 변경)

추가로 우선순위 라벨(`priority: high` 등)은 이슈 생성 후 수동으로 붙이는 것을 권장합니다.

---

## Template Content 제안

```markdown
## 📋 백로그 항목 설명
<!-- 이 백로그 항목이 무엇인지 간결하게 설명해주세요 -->


## 🎯 목표 (Goal)
<!-- 이 작업을 통해 달성하고자 하는 목표 -->


## ✅ 완료 조건 (Definition of Done)
<!-- 이 항목이 "완료"로 간주되기 위한 조건을 체크리스트로 작성 -->
- [ ] 
- [ ] 
- [ ] 

## 📝 세부 작업 (Tasks)
<!-- 이 백로그를 완료하기 위해 필요한 세부 작업들 -->
- [ ] 
- [ ] 
- [ ] 

## 🔗 관련 이슈 / 참고 자료
<!-- 관련된 이슈 번호나 참고 링크가 있다면 작성 -->
- 

## 💬 기타 메모
<!-- 추가로 공유할 내용이 있다면 자유롭게 작성 -->

```

---

## 각 섹션 의도

| 섹션 | 목적 |
|---|---|
| **백로그 항목 설명** | 작업의 개요를 한눈에 파악 |
| **목표** | "왜" 이 작업을 하는지 명확히 하여 방향성 유지 |
| **완료 조건** | 작업 완료 기준을 사전에 합의하여 불필요한 논의 방지 |
| **세부 작업** | 큰 백로그를 작은 단위로 분해하여 진행률 추적 |
| **관련 이슈 / 참고 자료** | 이슈 간 연결성 확보 |
| **기타 메모** | 맥락 정보나 논의 사항 기록 |

---

## 파일 위치

이 템플릿 파일은 아래 경로에 생성하면 됩니다:

```
.github/ISSUE_TEMPLATE/sprint_backlog.md
```

파일 상단의 YAML front matter는 다음과 같이 구성합니다:

```yaml
---
name: Sprint Backlog
about: 백로그 생성을 위한 이슈 템플릿
title: "[Backlog] "
labels: "type: backlog, status: ready"
assignees: ''
---
```

러너톤 프로젝트 특성상 **간결하면서도 추적 가능한 구조**로 구성했습니다. 필요에 따라 섹션을 줄이거나 추가하셔도 됩니다. Agent 모드로 전환하시면 바로 파일 생성도 도와드릴 수 있습니다.

# (3)
GitHub Wiki 등록 방법
실제 GitHub Wiki에 등록하려면:
# 1. 리포지토리의 Wiki 클론
git clone https://github.com/<username>/voice-vault.wiki.git

# 2. wiki/ 폴더의 파일들을 복사
cp -r Project/wiki/* voice-vault.wiki/

# 3. 커밋 & 푸시
cd voice-vault.wiki
git add .
git commit -m "docs: add comprehensive wiki pages"
git push
# 1. 리포지토리의 Wiki 클론git clone https://github.com/<username>/voice-vault.wiki.git# 2. wiki/ 폴더의 파일들을 복사cp -r Project/wiki/* voice-vault.wiki/# 3. 커밋 & 푸시cd voice-vault.wikigit add .git commit -m "docs: add comprehensive wiki pages"git push
또는 GitHub 웹 UI에서 각 페이지를 직접 생성하고 내용을 붙여넣을 수 있습니다. _Sidebar.md는 모든 페이지에 자동으로 좌측 네비게이션으로 표시됩니다.