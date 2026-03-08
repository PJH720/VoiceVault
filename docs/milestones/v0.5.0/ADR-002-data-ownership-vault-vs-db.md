# ADR-002: 데이터 소유권 결정 — Vault vs DB

| 항목 | 내용 |
|------|------|
| **상태** | ✅ Accepted |
| **날짜** | 2026-02-25 |
| **관련 이슈** | [#142](https://github.com/PJH720/VoiceVault/issues/142) |
| **결정자** | Jae-hyun Park |

---

## 1. 컨텍스트 (Context)

VoiceVault는 두 가지 영구 저장소를 가집니다:

1. **SQLite** (`data/voicevault.db`): 녹음 메타데이터, 전사, 요약, 분류 결과
2. **Obsidian Vault** (`.md` 파일들): 사용자가 직접 관리하는 지식 베이스

v0.5.0에서 Plugin이 Vault에 직접 쓰기 작업을 수행하게 됩니다. 이때 같은 데이터가 **두 곳에 동시에 존재**할 수 있습니다.

다음 질문에 답해야 합니다:
- 어떤 데이터가 어디에 저장되는가?
- DB와 Vault가 불일치할 때 어떻게 처리하는가?
- ChromaDB 벡터 데이터는 어느 쪽 소유인가?

---

## 2. 결정 (Decision)

### 2.1 데이터 유형별 저장 위치

| 데이터 유형 | 저장 위치 | 소유자 | 설명 |
|-------------|-----------|--------|------|
| 녹음 오디오 파일 | `data/recordings/` | **Backend** | 바이너리, Vault에 부적합 |
| 녹음 메타데이터 (id, 날짜, 길이) | **SQLite** | Backend | 구조적 데이터, 쿼리 필요 |
| 실시간 전사 텍스트 | **SQLite** | Backend | 원본 기록 보존 |
| 1분 단위 요약 | **SQLite** | Backend | 처리 중간 결과 |
| 시간 통합 요약 | **SQLite** | Backend | 최종 요약 원본 |
| 분류 결과 (템플릿, 신뢰도) | **SQLite** | Backend | 재분류 가능해야 함 |
| 벡터 임베딩 | **ChromaDB** | Backend | RAG 검색용, Vault와 무관 |
| **Obsidian Markdown Export** | **Vault** | **사용자** | 사용자가 편집/관리 |
| Vault 내 wikilinks | **Vault** | **사용자** | Obsidian 네이티브 기능 |

### 2.2 핵심 원칙: **DB-First, Vault는 파생물**

```
SQLite (Source of Truth)
    │
    ├── 쿼리·집계·분류·RAG 검색의 기준
    │
    └── Export 트리거 → Vault에 .md 파일 생성
                            │
                            └── 사용자 편집 가능 (Vault 소유)
                                (편집 내용은 DB에 역동기화 안 함)
```

**Vault → DB 역동기화는 v0.5.0에서 구현하지 않습니다.** 사용자가 Vault의 .md를 수정해도 DB에 반영되지 않으며, 이는 허용된 동작입니다. Vault의 .md는 "내보낸 스냅샷"으로 취급합니다.

### 2.3 Obsidian Markdown Export 파일 구조

```
<Vault Root>/
└── VoiceVault/
    ├── Recordings/
    │   ├── 2026-02-25/
    │   │   ├── [대화] 카페 미팅 - 09:00.md
    │   │   ├── [강의] Advanced AI - 10:30.md
    │   │   └── [메모] 스터디 세션 - 13:00.md
    │   └── 2026-02-26/
    │       └── ...
    └── _VoiceVault Index.md    ← 전체 색인 (자동 생성)
```

폴더 구조 규칙: `VoiceVault/Recordings/YYYY-MM-DD/[분류] 제목 - HH:MM.md`

### 2.4 Frontmatter 스키마 (표준화)

```yaml
---
# 필수 필드 (Required)
id: "rec_20260225_090000"        # SQLite recording.id
title: "카페 미팅"
date: 2026-02-25
time: "09:00"
duration_minutes: 45
type: "대화"                      # 강의 | 대화 | 메모 | 기타

# 자동 생성 (Auto-generated)
created_by: "VoiceVault/0.5.0"
exported_at: "2026-02-25T14:30:00+09:00"
source_db_id: 42                 # SQLite primary key

# 선택 필드 (Optional)
speakers: ["Jae-hyun", "Friend"]
keywords: ["프로젝트", "deadline", "AI"]
confidence: 0.92
tags: [voicevault, 대화, 2026-02]
related: []                      # [[wikilinks]] — RAG 기반 자동 생성
---
```

### 2.5 동기화 전략

| 시나리오 | 처리 방식 |
|----------|-----------|
| DB에 있지만 Vault에 없음 | Export 시 Vault에 생성 |
| Vault에 있지만 DB에 없음 | 무시 (사용자가 외부 파일 추가한 것으로 간주) |
| DB와 Vault 내용 불일치 | Vault가 우선 (사용자 편집 존중), DB는 원본 보존 |
| Export 재실행 | 기존 파일 덮어쓰기 (frontmatter `exported_at` 갱신) |
| Export 파일 사용자 삭제 | DB에서 삭제 안 함 (독립적) |

### 2.6 ChromaDB 벡터 데이터 소유권

- **소유자**: Backend (SQLite와 동일 레이어)
- **재구축 가능**: SQLite의 요약 텍스트로 언제든 재임베딩 가능
- **Vault 연관 없음**: 벡터는 내부 검색 인프라, 사용자 노출 불필요
- **재구축 명령**: `PYTHONPATH=backend python backend/scripts/reindex_chromadb.py`

---

## 3. 고려한 대안 (Alternatives Considered)

### 대안 A: Vault-First (Vault가 Source of Truth)
- **개념**: Vault의 .md가 원본, DB는 캐시
- **장점**: 사용자 편집이 즉시 반영
- **단점**: Markdown 파싱으로 구조적 쿼리 불가. RAG는 DB 의존. 충돌 해소 복잡.
- **결론**: ❌ 기각 — 현재 아키텍처와 근본적 충돌

### 대안 B: 완전 분리 (양방향 동기화 없음)
- **개념**: DB와 Vault는 완전히 독립적
- **장점**: 단순
- **단점**: 사용자가 Vault의 변경을 DB에 반영할 방법 없음
- **결론**: ✅ **채택** — v0.5.0 범위에서는 이것이 현실적. Vault → DB 역동기화는 v1.0으로 연기.

### 대안 C: 하이브리드 (선택적 역동기화)
- **개념**: 사용자가 명시적으로 "Vault → DB 동기화"를 트리거
- **장점**: 유연성
- **단점**: 충돌 해소 로직, 파싱 로직 복잡도 대폭 상승
- **결론**: ❌ v1.0으로 연기

---

## 4. 결과 (Consequences)

### 긍정적 결과
- DB가 항상 Source of Truth → RAG, 분류, 쿼리 결과 일관성 보장
- Export는 단방향 → 충돌 해소 로직 불필요, 구현 단순
- Vault 파일은 사용자가 자유롭게 편집 가능

### 부정적 결과 / 트레이드오프
- Vault 편집 내용이 DB에 반영되지 않음 → 사용자에게 명확히 고지 필요
- Export 재실행 시 사용자 편집이 덮어써질 위험 → 경고 메시지 + `--no-overwrite` 옵션 제공

### 이 ADR에 의존하는 이슈
- #150 Vault 통합 리팩토링 (Export 서비스, Vault adapter)
- #144 Plugin Feature Spec (Export 플로우 설계)
- #152 테스트 계획 (Export E2E 테스트)

---

## 5. 구현 참고

### Vault 파일 쓰기 패턴 (Plugin 측)
```typescript
// ✅ 올바른 패턴 — app.vault API 사용
const filePath = normalizePath(`VoiceVault/Recordings/${date}/${filename}.md`);
const exists = await this.app.vault.adapter.exists(filePath);

if (exists) {
  // 덮어쓰기 전 경고
  const confirm = await this.confirmOverwrite(filePath);
  if (!confirm) return;
  await this.app.vault.modify(
    this.app.vault.getAbstractFileByPath(filePath) as TFile,
    content
  );
} else {
  await this.app.vault.create(filePath, content);
}
```

### Export 서비스 리팩토링 방향 (Backend 측)
```python
# src/services/storage/obsidian_export.py
class VaultAdapter:
    """Vault 경로 관리 및 파일 생성 인터페이스"""
    def __init__(self, vault_root: Path): ...
    def get_export_path(self, recording: Recording) -> Path: ...
    def write_markdown(self, path: Path, content: str, overwrite: bool = True) -> None: ...
    def ensure_folder_structure(self, date: str) -> None: ...
```

---

*Closes #142*
