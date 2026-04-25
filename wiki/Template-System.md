# Template System

VoiceVault의 자동 분류 템플릿 시스템 설계 및 커스터마이징 가이드입니다.

---

## 개요

템플릿 시스템은 녹음 종료 시 AI가 녹음 내용을 **사용자가 정의한 카테고리**로 자동 분류하고, 각 카테고리에 맞는 **구조화된 Markdown 문서**를 생성하는 핵심 기능입니다.

```
녹음 내용 → Zero-shot LLM 분류 → 템플릿 매칭 → MD 문서 생성
```

---

## 기본 제공 템플릿 (4종)

### 1. 강의 노트 (`lecture_note`)

```json
{
  "name": "lecture_note",
  "display_name": "강의 노트",
  "description": "교수 강의, 세미나, 워크샵 등 학습 콘텐츠",
  "icon": "📚",
  "priority": 80,
  "triggers": [
    "교수", "강의", "과목", "수업", "이론", "수식",
    "시험", "과제", "학점", "중간고사", "기말고사"
  ],
  "speaker_pattern": "one_to_many",
  "output_format": "# [{{course_name}}] 강의 - {{date}}\n\n## 핵심 개념\n{{key_concepts}}\n\n## 주요 내용\n{{main_content}}\n\n## 질의응답\n{{qa_section}}\n\n## 다음 시간 예고\n{{next_preview}}",
  "fields": [
    {"name": "course_name", "type": "string", "description": "과목명"},
    {"name": "date", "type": "date", "description": "강의 날짜"},
    {"name": "key_concepts", "type": "bullet_list", "description": "핵심 개념 목록"},
    {"name": "main_content", "type": "sections", "description": "주제별 내용"},
    {"name": "qa_section", "type": "qa_pairs", "description": "질문과 답변"},
    {"name": "next_preview", "type": "string", "description": "다음 강의 예고"}
  ]
}
```

### 2. 친구 대화 (`friend_conversation`)

```json
{
  "name": "friend_conversation",
  "display_name": "친구 대화",
  "description": "친구, 지인과의 비공식 대화",
  "icon": "👥",
  "priority": 60,
  "triggers": [
    "친구", "만남", "카페", "밥", "약속",
    "어때", "뭐해", "ㅋㅋ", "재밌다"
  ],
  "speaker_pattern": "many_to_many",
  "output_format": "# {{friend_name}}과의 대화 - {{date}}\n\n## 주요 주제\n{{topics}}\n\n## 중요 사건\n{{events}}\n\n## 액션 아이템\n{{action_items}}",
  "fields": [
    {"name": "friend_name", "type": "string", "description": "대화 상대 이름"},
    {"name": "date", "type": "date", "description": "대화 날짜"},
    {"name": "topics", "type": "bullet_list", "description": "대화 주제"},
    {"name": "events", "type": "timeline", "description": "주요 사건"},
    {"name": "action_items", "type": "checklist", "description": "약속/할 일"}
  ]
}
```

### 3. 회의록 (`meeting_minutes`)

```json
{
  "name": "meeting_minutes",
  "display_name": "회의록",
  "description": "공식/비공식 회의, 팀 미팅",
  "icon": "📋",
  "priority": 70,
  "triggers": [
    "회의", "안건", "결정", "담당자", "미팅",
    "프로젝트", "일정", "보고", "진행 상황"
  ],
  "speaker_pattern": "many_to_many",
  "output_format": "# 회의록 - {{title}} ({{date}})\n\n## 참석자\n{{attendees}}\n\n## 안건\n{{agenda}}\n\n## 논의 내용\n{{discussion}}\n\n## 결정 사항\n{{decisions}}\n\n## 액션 아이템\n{{action_items}}",
  "fields": [
    {"name": "title", "type": "string", "description": "회의 제목"},
    {"name": "attendees", "type": "list", "description": "참석자 목록"},
    {"name": "agenda", "type": "numbered_list", "description": "안건"},
    {"name": "discussion", "type": "sections", "description": "논의 내용"},
    {"name": "decisions", "type": "bullet_list", "description": "결정 사항"},
    {"name": "action_items", "type": "checklist", "description": "액션 아이템 (담당자 포함)"}
  ]
}
```

### 4. 아이디어 메모 (`idea_memo`)

```json
{
  "name": "idea_memo",
  "display_name": "아이디어 메모",
  "description": "혼잣말, 브레인스토밍, 개인 생각 정리",
  "icon": "💡",
  "priority": 40,
  "triggers": [
    "생각해보니", "아이디어", "메모", "기억",
    "나중에", "해봐야지", "궁금한데"
  ],
  "speaker_pattern": "solo",
  "output_format": "# 💡 아이디어 메모 - {{date}}\n\n## 핵심 아이디어\n{{main_idea}}\n\n## 상세 내용\n{{details}}\n\n## 관련 메모\n{{related}}\n\n## TODO\n{{todos}}",
  "fields": [
    {"name": "main_idea", "type": "string", "description": "핵심 아이디어 한 줄"},
    {"name": "details", "type": "freeform", "description": "상세 내용"},
    {"name": "related", "type": "bullet_list", "description": "관련 주제/링크"},
    {"name": "todos", "type": "checklist", "description": "할 일 목록"}
  ]
}
```

---

## 분류 알고리즘

### 1단계: 트리거 키워드 스코어링

각 1분 요약의 키워드를 템플릿 트리거와 매칭합니다.

```python
# 예시: "미적분학 교수님이 미분 정의를 설명"
scores = {
    "lecture_note": 3,       # "교수", "미분" → 트리거 매칭
    "meeting_minutes": 0,
    "friend_conversation": 0,
    "idea_memo": 0
}
```

### 2단계: 화자 패턴 분석

| 패턴 | 설명 | 매칭 템플릿 |
|------|------|-----------|
| `one_to_many` | 한 명이 대부분 발화 | 강의 노트 |
| `many_to_many` | 여러 명 고르게 발화 | 회의록, 대화 |
| `solo` | 혼잣말 | 아이디어 메모 |

### 3단계: Zero-shot LLM 분류

키워드 스코어와 화자 패턴으로 판단이 어려운 경우 LLM에 최종 결정을 위임합니다.

```python
prompt = f"""
사용 가능한 템플릿:
{json.dumps(templates, ensure_ascii=False)}

녹음 요약:
{hour_summary}

위 녹음을 가장 적절한 템플릿으로 분류하세요.
JSON 형식으로 응답하세요.
"""
```

### 4단계: 신뢰도 평가

| 신뢰도 | 처리 |
|--------|------|
| ≥ 0.85 | 자동 분류 확정 |
| 0.70 ~ 0.84 | 분류 적용 + "확인 필요" 표시 |
| < 0.70 | "기타"로 분류 + 사용자 수동 분류 요청 |

---

## 커스텀 템플릿 만들기

### UI에서 생성

1. **Templates** 페이지 → **"New Template"** 클릭
2. 이름, 트리거 키워드, 출력 형식 입력
3. 필드 정의 (추출할 정보 설정)
4. 우선순위 설정
5. **Save** 클릭

### API로 생성

```bash
curl -X POST http://localhost:8000/api/v1/templates \
  -H "Content-Type: application/json" \
  -d '{
    "name": "book_club",
    "display_name": "독서 모임",
    "triggers": ["책", "독서", "저자", "챕터", "토론"],
    "output_format": "# 📖 독서 모임 - {{book_title}}\n\n## 논의 내용\n{{discussion}}\n\n## 인상 깊은 구절\n{{quotes}}",
    "fields": [
      {"name": "book_title", "type": "string"},
      {"name": "discussion", "type": "sections"},
      {"name": "quotes", "type": "bullet_list"}
    ],
    "icon": "📖",
    "priority": 55
  }'
```

### JSON 파일로 생성

`templates/` 디렉토리에 JSON 파일을 추가하고:

```bash
python scripts/seed_templates.py
```

---

## 출력 형식 변수

템플릿의 `output_format`에서 사용할 수 있는 변수:

| 변수 | 설명 | 예시 |
|------|------|------|
| `{{date}}` | 녹음 날짜 | 2026-02-10 |
| `{{time_range}}` | 시간 범위 | 09:00-10:30 |
| `{{duration}}` | 소요 시간 | 01:30:00 |
| `{{speakers}}` | 화자 목록 | 교수, 학생1 |
| `{{keywords}}` | 키워드 목록 | 미분, 극한 |
| `{{confidence}}` | 분류 신뢰도 | 0.94 |
| 사용자 정의 필드 | fields에 정의한 필드 | 자유 |

---

## 관련 문서

- [User Guide](User-Guide) - 분류 결과 확인 방법
- [API Reference](API-Reference) - Template CRUD API
- [Data Schema & Pipeline](Data-Schema-&-Pipeline) - DB 스키마
