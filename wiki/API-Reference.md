# API Reference

VoiceVault FastAPI 백엔드의 REST 및 WebSocket 엔드포인트 명세입니다.

> Swagger UI: `http://localhost:8000/docs`
> ReDoc: `http://localhost:8000/redoc`

---

## Base URL

```
http://localhost:8000/api/v1
```

---

## WebSocket Endpoints

### `WS /ws/transcribe`

실시간 음성 전사를 위한 WebSocket 엔드포인트.

**연결**:
```
ws://localhost:8000/ws/transcribe?recording_id={id}
```

**Client → Server** (Binary):
```
audio_chunk: bytes (PCM 16-bit, 16kHz, mono)
```

**Server → Client** (JSON):
```json
{
  "type": "transcript",
  "data": {
    "text": "오늘 강의에서는 미분의...",
    "timestamp": "00:03:42",
    "confidence": 0.94,
    "is_final": true
  }
}
```

```json
{
  "type": "summary",
  "data": {
    "minute_index": 3,
    "summary_text": "미분의 정의와 극한 개념 설명",
    "keywords": ["미분", "극한"],
    "confidence": 0.92
  }
}
```

```json
{
  "type": "error",
  "data": {
    "code": "STT_FAILURE",
    "message": "Whisper transcription failed",
    "minute_index": 5
  }
}
```

---

## REST Endpoints

### Recording

#### `POST /api/v1/recordings`

새 녹음 세션을 생성합니다.

**Request Body**:
```json
{
  "metadata": {
    "title": "미적분학 강의",
    "tags": ["수학", "강의"]
  }
}
```

**Response** `201 Created`:
```json
{
  "id": 1,
  "started_at": "2026-02-10T09:00:00Z",
  "status": "recording",
  "websocket_url": "ws://localhost:8000/ws/transcribe?recording_id=1"
}
```

---

#### `PATCH /api/v1/recordings/{id}/stop`

녹음을 중지하고 후처리(분류)를 트리거합니다.

**Response** `200 OK`:
```json
{
  "id": 1,
  "started_at": "2026-02-10T09:00:00Z",
  "ended_at": "2026-02-10T10:30:00Z",
  "status": "processing",
  "total_minutes": 90,
  "message": "Classification started. Check /api/v1/recordings/1/classifications"
}
```

---

#### `GET /api/v1/recordings`

녹음 목록을 조회합니다.

**Query Parameters**:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | - | 필터: recording, processing, completed |
| `from_date` | datetime | - | 시작일 필터 |
| `to_date` | datetime | - | 종료일 필터 |
| `limit` | int | 20 | 페이지 크기 |
| `offset` | int | 0 | 페이지 오프셋 |

**Response** `200 OK`:
```json
{
  "total": 42,
  "items": [
    {
      "id": 1,
      "started_at": "2026-02-10T09:00:00Z",
      "ended_at": "2026-02-10T10:30:00Z",
      "status": "completed",
      "total_minutes": 90
    }
  ]
}
```

---

#### `GET /api/v1/recordings/{id}`

특정 녹음의 상세 정보를 조회합니다.

**Response** `200 OK`:
```json
{
  "id": 1,
  "started_at": "2026-02-10T09:00:00Z",
  "ended_at": "2026-02-10T10:30:00Z",
  "status": "completed",
  "total_minutes": 90,
  "audio_path": "data/recordings/rec-20260210-090000.wav",
  "summary_count": 90,
  "classification_count": 3,
  "metadata": {"title": "미적분학 강의"}
}
```

---

### Summaries

#### `GET /api/v1/recordings/{id}/summaries`

녹음의 1분 단위 요약 목록을 조회합니다.

**Query Parameters**:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `from_minute` | int | 0 | 시작 분 |
| `to_minute` | int | - | 종료 분 |

**Response** `200 OK`:
```json
{
  "recording_id": 1,
  "total": 90,
  "items": [
    {
      "minute_index": 0,
      "summary_text": "강의 시작. 오늘 주제: 미분의 정의",
      "keywords": ["미분", "정의"],
      "speakers": ["교수"],
      "confidence": 0.94
    }
  ]
}
```

---

#### `GET /api/v1/recordings/{id}/hour-summaries`

1시간 통합 요약을 조회합니다.

**Response** `200 OK`:
```json
{
  "recording_id": 1,
  "items": [
    {
      "hour_index": 0,
      "summary_text": "첫 1시간: 미분의 정의부터 극한의 엡실론-델타 정의까지...",
      "keywords": ["미분", "극한", "엡실론-델타"],
      "token_count": 580
    }
  ]
}
```

---

#### `POST /api/v1/recordings/{id}/extract`

특정 시간 구간을 추출하여 재요약합니다 (크로스 경계 지원).

**Request Body**:
```json
{
  "start_minute": 40,
  "end_minute": 80
}
```

**Response** `200 OK`:
```json
{
  "recording_id": 1,
  "range": {"start_minute": 40, "end_minute": 80},
  "summary_text": "00:40~01:20 구간 통합 요약...",
  "keywords": ["상대성이론", "시간 팽창"],
  "source_summaries_count": 40
}
```

---

### Classification

#### `GET /api/v1/recordings/{id}/classifications`

분류 결과를 조회합니다.

**Response** `200 OK`:
```json
{
  "recording_id": 1,
  "items": [
    {
      "id": 1,
      "template_name": "lecture_note",
      "display_name": "강의 노트",
      "start_minute": 0,
      "end_minute": 90,
      "confidence": 0.94,
      "icon": "📚"
    },
    {
      "id": 2,
      "template_name": "friend_conversation",
      "display_name": "친구 대화",
      "start_minute": 90,
      "end_minute": 120,
      "confidence": 0.88,
      "icon": "👥"
    }
  ]
}
```

---

#### `PATCH /api/v1/classifications/{id}`

분류 결과를 수동으로 수정합니다.

**Request Body**:
```json
{
  "template_name": "meeting_minutes"
}
```

---

### Templates

#### `GET /api/v1/templates`

등록된 분류 템플릿 목록을 조회합니다.

#### `POST /api/v1/templates`

새 분류 템플릿을 생성합니다.

**Request Body**:
```json
{
  "name": "study_group",
  "display_name": "스터디 그룹",
  "triggers": ["스터디", "공부", "문제 풀이"],
  "output_format": "# {{title}}\n## 학습 내용\n{{content}}\n## 복습 필요\n{{review}}",
  "fields": ["title", "content", "review", "participants"],
  "icon": "📖",
  "priority": 60
}
```

#### `PUT /api/v1/templates/{id}`

템플릿을 수정합니다.

#### `DELETE /api/v1/templates/{id}`

템플릿을 삭제합니다 (기본 템플릿은 삭제 불가).

---

### Export

#### `POST /api/v1/recordings/{id}/export`

녹음 결과를 파일로 내보냅니다.

**Request Body**:
```json
{
  "classification_ids": [1, 2],
  "format": "markdown",
  "include_transcript": false,
  "include_metadata": true
}
```

**Response** `200 OK`:
```json
{
  "files": [
    {
      "filename": "2026-02-10_미적분학_강의.md",
      "path": "data/exports/2026-02-10_미적분학_강의.md",
      "size_bytes": 4523
    }
  ],
  "download_url": "/api/v1/exports/download?ids=1,2"
}
```

#### `GET /api/v1/exports/download`

내보낸 파일을 다운로드합니다 (ZIP 또는 단일 파일).

---

## 에러 응답 형식

모든 에러는 일관된 형식으로 반환됩니다.

```json
{
  "detail": "Recording not found",
  "code": "RECORDING_NOT_FOUND",
  "timestamp": "2026-02-10T09:00:00Z"
}
```

### 에러 코드

| Code | HTTP Status | Description |
|------|------------|-------------|
| `RECORDING_NOT_FOUND` | 404 | 녹음을 찾을 수 없음 |
| `RECORDING_ALREADY_STOPPED` | 409 | 이미 중지된 녹음 |
| `STT_FAILURE` | 502 | Whisper 처리 실패 |
| `LLM_FAILURE` | 502 | Claude/Ollama 호출 실패 |
| `TEMPLATE_NOT_FOUND` | 404 | 템플릿을 찾을 수 없음 |
| `VALIDATION_ERROR` | 422 | 요청 데이터 검증 실패 |
| `RATE_LIMIT_EXCEEDED` | 429 | API 호출 제한 초과 |

---

## 관련 문서

- [Architecture](Architecture) - 시스템 구조
- [Development Guide](Development-Guide) - 새 엔드포인트 추가 방법
