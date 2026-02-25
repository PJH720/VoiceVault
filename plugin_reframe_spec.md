# 🧠 음성 녹음 RAG PKM 플러그인: 플러그인 형태 재설계 & 아이디어 프레임워크
## "독립 앱" → "Obsidian 플러그인" 패러다임 전환

**문서 작성일**: 2026-01-30 (러너톤 2주차 종료)  
**핵심 변화**: 기존 아이디어를 플러그인 형태로 재구성하고, 다른 러너톤 팀들의 성공 패턴 적용

---

# 📊 핵심 변화: "왜 플러그인인가"

## 이전 개념 (독립 앱)
- ❌ 사용자가 새로운 앱을 설치하고 학습해야 함
- ❌ 기존 PKM 도구(Obsidian, Notion) 생태계와 분리
- ❌ 데이터 이동 비용 높음 (새 노트 앱 도입)
- ❌ 사용자 채택률 낮음 (또 다른 앱...)

## 수정된 개념 (플러그인)
- ✅ 기존 사용자가 이미 쓰는 도구에 **통합**
- ✅ 새로운 학습 곡선 없음 (기존 도구 그대로 사용)
- ✅ "음성 입력 + AI 정리" 능력만 **레이어로 추가**
- ✅ 사용자 채택률 극대화 (직관적 경험)

### 교훈
Obsidian 플러그인 생태계 성공 사례 + 다른 러너톤 팀들의 "사용자 주도 설계" 원칙

---

# 🎯 플러그인 형태별 선택지 & 추천

## Option 1: 🏆 **Obsidian 플러그인** (추천)

### 이유
- 당신이 가장 친숙함
- 개발자/학생 커뮤니티 활발 (당신의 타겟 사용자)
- 플러그인 생태계 성숙도 높음
- TypeScript + npm 표준 스택

### 구현 대상
```typescript
// obsidian-voice-rag 플러그인
- 음성 녹음 → 실시간 전사 (Whisper)
- 1분 단위 요약 (Claude)
- 자동 분류 (사용자 템플릿)
- 현재 note에 자동 추가 또는 새 note 생성
- 크로스 note RAG 검색
```

### 사용자 경험
```
Obsidian 메인 화면
  ↓
우측 사이드바 "음성 RAG" 패널 추가
  ↓
녹음 시작 → 실시간 전사 표시
  ↓
자동 요약 + 분류 → 현재 note에 입력
  ↓
전체 vault에서 "관련 노트" 자동 제안 (RAG)
```

### MVP 범위 (2주)
- ✅ 음성 녹음 UI (Obsidian 권장 패턴)
- ✅ Whisper 통합
- ✅ Claude 1분 요약
- ✅ 현재 note에 자동 추가
- ▲ RAG 검색 (Week 2 추가)

---

# ✨ "다른 러너톤 팀들"로부터의 핵심 인사이트 적용

## 1️⃣ 사용자 주도 설계 (현장노트 사례)

### 현장노트 배경
> "현장소장은 디지털 도구에 익숙하지 않은 경우가 많아, 입력 부담을 극도로 낮추고(2분 입력), 변동성을 이벤트로 받아 즉시 계획과 문서를 업데이트하는 현장형 AI 운영체계가 필요"

### 당신의 프로젝트에 적용
```
❌ "완벽한 음성 앱을 만들어 사용자 학습시키기"
✅ "Obsidian 사용자가 이미 쓰는 환경에, 음성 기능만 추가"

❌ 사용자가 새 앱을 설치 후 "이건 어떻게 써?"
✅ Obsidian 우측 패널에 "마이크 버튼" → 클릭 → 자동 정리 → note에 추가
```

### 입력 최소화 원칙 (2분 규칙)
- 마이크 클릭 (1초)
- 녹음 (가변)
- 자동 정리 (백그라운드)
- Note에 자동 추가 (사용자 개입 불필요)

---

## 2️⃣ 메타데이터 추출 + 근거 제시 (LogWatch 사례)

### LogWatch 패턴
```json
❌ "위험도: HIGH"
✅ "위험도: HIGH
    근거: 정책 3.2절 (접근 통제)
    출처: 정책 문서, 2026-01-30
    액션: 즉시 차단"
```

### 당신의 플러그인에 적용
```json
{
  "summary": "프로젝트 deadline 다음 주 금요일, 데이터 전처리 논의",
  "category": "friend_note",
  "confidence": 0.92,
  "metadata": {
    "recording_date": "2026-01-30T14:32:00Z",
    "duration": "00:45:30",
    "speakers": ["User", "Sarah"],
    "keywords": ["project", "deadline", "data_preprocessing"],
    "raw_transcript_link": "obsidian://open?path=note_id"  // 원본 링크
  },
  "sources": [
    {
      "type": "note_reference",
      "note_title": "Projects - Active",
      "timestamp": "2026-01-20"
    }
  ]
}
```

---

## 3️⃣ MVP 범위 극도로 좁히기 (PaperMaker, 현장노트 사례)

### 각 프로젝트의 MVP (1주 내 구현)
- **PaperMaker**: PDF 업로드 → 문항 번호만 입력 → 시험지 PDF 다운로드 (4단계)
- **현장노트**: 체크 입력 → 공정 재계산 → 일보 자동생성 (3단계)
- **당신의 플러그인**: 녹음 시작 → 자동 요약 → Note 추가 (3단계)

### 엣지 케이스는 명시적으로 미루기
```
✅ [MVP - Week 1]
- 실시간 전사
- 1분 요약 (Claude)
- Note에 추가

⏸ [추후 개선]
- 1시간 통합 요약
- 크로스 경계 검색
- Advanced RAG (벡터 + 키워드)
```

---

## 4️⃣ 불확실성 명시 (현장노트 Local-First 원칙)

### 현장노트 설계
> "타팀 정보가 없을 땐 불확실성(모름)을 표시하는 현장 단독(Local-First) 시스템"

### 당신의 플러그인에 적용
```json
// ❌ 나쁜 예
{
  "category": "lecture_note",  // 확신 없는데 단정
  "confidence": 0.5
}

// ✅ 좋은 예
{
  "category_prediction": "lecture_note",
  "confidence": 0.62,
  "reasoning": "키워드 분석으로는 강의인 것 같지만, 확실하지 않음",
  "alternative_categories": ["friend_note", "personal_memo"],
  "status": "requires_user_review"  // 사용자 수동 확인 권장
}
```

---

## 5️⃣ 배포 & 기술 선택 (Sync-Up의 바이브 코딩 적용)

### Sync-Up 접근
> "Cursor 등 AI 도구를 활용한 '바이브 코딩' 기법 도입. 1인 개발임에도 불구하고 고도화된 로직을 고속으로 구현"

### 당신의 플러그인에 적용
```
기술 선택 원칙:
✅ Obsidian API (잘 문서화됨, TypeScript)
✅ Claude/Ollama (이미 검증된 기술)
✅ Whisper (음성 인식 검증됨)
✗ Electron/Tauri (사용하지 말 것 - 플러그인이 목표)
✅ Node.js + npm (Obsidian 에코시스템 표준)

배포:
✅ Obsidian Community Plugins (공식 마켓)
✅ GitHub Release (자동 설치)
✗ 커스텀 설치 방식 (사용자 진입장벽 높음)
```

---

# 🏗️ 최종 기획: "Obsidian Voice RAG 플러그인"

## 프로젝트 개요

### 프로젝트명
`obsidian-voice-rag` (또는 `Vault Voices`)

### 핵심 기능
1. **실시간 음성 녹음** → Whisper로 전사 → Obsidian note에 자동 추가
2. **자동 요약 + 분류** → Claude로 1분 요약 + 사용자 템플릿 적용
3. **Vault 내 관련 노트 제안** → 기존 note들과 연결 (기초 RAG)

## 사용자 여정 (User Journey)

```
## Day 1: 강의 중

Obsidian 열어두기
  ↓
우측 패널의 "Voice RAG" 클릭
  ↓
마이크 버튼 클릭 → "녹음 중..."
  ↓
음성 → 실시간 전사 표시
  ↓
녹음 종료 (자동 또는 버튼)

## Day 1 저녁: 정리

자동 요약 생성 (AI)
  ↓
현재 note에 삽입 또는 새 note 생성
  ↓
Vault 내 유사 note 제안
  ↓
사용자가 수동 분류 (또는 AI 자동 분류 확인)

## Week 1: 복습

"Related Notes" 기능으로 같은 카테고리의 과거 녹음 찾기
  ↓
시간순, 주제순 정렬
  ↓
한 곳에서 모든 강의 노트 통합 관리
```

## MVP 기능 명세 (2주)

### Week 1: 핵심 파이프라인

```
[MVP v0.1]

1. 음성 입력 UI
   - 마이크 버튼 (녹음 시작/중지)
   - 실시간 전사 표시 (타임스탬프)
   - 음성 파일 로컬 저장

2. Whisper 통합
   - 오프라인 STT (로컬 tiny 모델)
   - 실시간 스트리밍 (WebSocket)

3. 단순 1분 요약
   - Ollama 또는 Claude API (사용자 선택)
   - JSON 출력 (summary, keywords, speakers)

4. Obsidian 통합
   - 현재 note에 요약 자동 추가
   - 메타데이터 (타임스탬프, 신뢰도 등)
   - 원본 녹음 파일 링크

5. 기본 UI
   - 사이드패널 설정
   - 요약 프리뷰
```

### Week 2: 고급 기능

```
[MVP v0.2]

1. 자동 분류 (사용자 템플릿)
   - 기본 템플릿 3개 (강의, 친구, 회의)
   - Claude zero-shot 분류
   - 신뢰도 표시 + 수동 수정 가능

2. Vault 내 RAG
   - 요약된 note들과의 유사도 계산
   - 상위 3개 "관련 note" 추천
   - 클릭 시 해당 note로 이동

3. 템플릿 관리 UI
   - 설정 탭에서 커스텀 템플릿 추가
   - 트리거 키워드 설정
   - 우선순위 설정

4. 메타데이터 추출
   - 출처 정보 (note 제목, 생성 날짜)
   - 원본 전사본 링크
```

---

# 🎨 플러그인 구조 (개발 관점)

## 디렉토리 구조

```
obsidian-voice-rag/
├── manifest.json           # 플러그인 설정
├── esbuild.config.mjs      # 번들링 설정
├── src/
│   ├── main.ts             # 플러그인 진입점
│   ├── settings.ts         # 설정 탭 (API 키, 템플릿 등)
│   ├── ui/
│   │   ├── recordPanel.ts  # 녹음 UI (사이드패널)
│   │   ├── summaryModal.ts # 요약 결과 표시
│   │   └── styles.css      # 스타일
│   ├── services/
│   │   ├── whisper.ts      # STT (Whisper API/로컬)
│   │   ├── llm.ts          # LLM 요약 (Claude/Ollama)
│   │   ├── classifier.ts   # 자동 분류
│   │   └── rag.ts          # Vault 내 RAG 검색
│   ├── types.ts            # TypeScript 타입 정의
│   └── utils.ts            # 유틸리티 함수
└── README.md
```

---

# 📊 기존 사례로부터의 학습 포인트

| 프로젝트 | 핵심 원칙 | 당신의 플러그인에 적용 |
|---------|---------|------|
| **현장노트** | 입력 극소화 (2분 규칙) | 마이크 1클릭 → 자동 처리 |
| **LogWatch** | 메타데이터 + 근거 제시 | 원본 링크 + 신뢰도 함께 표시 |
| **PaperMaker** | 3단계 이하 MVP | 녹음 → 요약 → Note 추가 (3단계) |
| **Sync-Up** | 바이브 코딩 + AI 도구 | Claude/Cursor로 빠른 개발 |
| **Briefli** | 다단계 처리 (Haiku → Sonnet) | 저비용 요약 → 고성능 분류 |

---

# 🚀 2주 실행 계획 (수정)

## Week 1: Obsidian 플러그인 기본 구조 + STT

| Day | 목표 | 결과물 |
|-----|------|------|
| 1 | Obsidian 플러그인 보일러플레이트 | TypeScript 프로젝트 설정 |
| 2 | 마이크 UI 구현 (우측 패널) | 사이드패널에 녹음 버튼 표시 |
| 3 | Whisper/Ollama 통합 | 실시간 전사 작동 |
| 4 | Obsidian API 학습 | 현재 note에 데이터 삽입 |
| 5 | 음성 → Note 끝까지 연결 | 녹음 시작부터 note 추가까지 1주 MVP |
| 6-7 | 테스트 + 버그 수정 | **Week 1 완성** |

## Week 2: 요약 + 분류 + RAG

| Day | 목표 | 우선순위 |
|-----|------|---------|
| 8-9 | Claude/Ollama 1분 요약 | P1 |
| 10 | 자동 분류 + 템플릿 | P1 |
| 11-12 | Vault 내 RAG 검색 | P2 |
| 13 | 설정 탭 (사용자 커스터마이징) | P2 |
| 14 | 테스트 + 배포 준비 | P0 |

---

# ✅ 왜 이 형태가 더 나은가?

## "독립 앱" vs "플러그인" 비교

| 차원 | 독립 앱 | 플러그인 |
|------|--------|--------|
| **사용자 진입장벽** | 높음 (새 앱 설치 + 학습) | 낮음 (기존 도구에 기능 추가) |
| **채택 가능성** | 낮음 | 높음 |
| **차별화** | 기술 자체 | 사용자 경험 + 기존 도구 통합 |
| **유지보수** | Electron/Tauri 복잡도 | Obsidian API만 학습 |
| **배포** | 수동 설치 어려움 | Obsidian Community Plugins (1클릭) |
| **상품 감** | "또 다른 앱" | "내 Obsidian이 더 똑똑해졌다" |
| **러너톤 평가** | "기술은 좋지만 사용자가 누가?" | "실제 문제 해결 + 기존 생태계 활용" |

---

# 💡 최종 피칭 포인트 (발표용)

```
[기존]
"음성을 깨끗하게 정리해주는 AI 어시스턴트를 만들었습니다"
→ "근데 왜 이 앱을 써야 되는데?"

[수정]
"Obsidian, Notion, Apple Notes 같은
기존 노트 앱의 기능을 '음성 + AI 정리'로 강화합니다.
새로 배울 게 없고, 하루종일 녹음 → 자동 정리 → 검색 가능"
→ "아, 내 노트북이 더 똑똑해지는 거네!"
```

---

# 🎯 최종 결론

**당신의 프로젝트는**:
1. ✅ 기술적으로 타당한 것은 변함없음
2. ✅ 하지만 **형태를 플러그인으로 변경** (2주 내 완성도 ↑)
3. ✅ **사용자 진입장벽 ↓** (기존 도구 활용)
4. ✅ **러너톤 평가 포인트 ↑** (사용자 주도 설계 + 기존 생태계 활용)

**추천**: **Obsidian 플러그인**으로 시작하고, 나중에 Notion/로컬 마크다운으로 확장

---

**지금 바로 시작**: Obsidian Plugin Template 클론 + TypeScript 설정!
