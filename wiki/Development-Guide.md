# Development Guide

VoiceVault 개발 참여를 위한 환경 설정, 코딩 규칙, 워크플로우 가이드입니다.

---

## 개발 환경 설정

### 사전 요구사항

- [uv](https://docs.astral.sh/uv/) (Python 3.12는 uv가 자동 관리)
- Git
- (선택) Docker & Docker Compose
- (선택) Ollama (로컬 LLM 테스트용)

### 초기 설정

```bash
# 1. 리포지토리 클론
git clone https://github.com/<your-username>/voice-vault.git
cd voice-vault

# 2. uv로 가상환경 생성 & 활성화
uv venv --python 3.12
source .venv/bin/activate

# 3. 의존성 설치 (반드시 uv pip 사용)
uv pip install -r requirements.txt
uv pip install -e ".[dev]"

# 4. 환경변수 설정
cp .env.example .env
# .env 파일 편집 (Ollama 로컬 모드 추천)

# 5. Whisper 모델 다운로드 (base)
python scripts/download_models.py

# 6. 기본 템플릿 DB 초기화
python scripts/seed_templates.py

# 7. 개발 서버 실행
# 터미널 1: Backend
uvicorn src.api.app:app --reload --port 8000

# 터미널 2: Frontend
streamlit run src/ui/app.py
```

> **중요**: 패키지 설치는 반드시 `uv pip install ...`을 사용합니다. `pip install`은 동작하지 않습니다.

---

## 코딩 규칙

### Python 스타일

| 규칙 | 설명 |
|------|------|
| **Python 버전** | 3.12 (uv 관리) |
| **Type hints** | 모든 함수 시그니처에 필수 |
| **데이터 모델** | Pydantic v2 사용 |
| **비동기** | I/O 작업에 async/await |
| **Docstring** | Google 형식 |
| **라인 길이** | 최대 100자 |
| **Linter** | Ruff |
| **Formatter** | Ruff format |

### 네이밍 규칙

```python
# 파일명: snake_case.py
# 클래스: PascalCase
class MinuteSummarizer:
    
    # 상수: UPPER_SNAKE_CASE
    MAX_TOKENS = 200
    
    # 함수/변수: snake_case
    async def summarize_minute(self, transcript: str) -> SummaryResult:
        """1분 전사본을 요약합니다.
        
        Args:
            transcript: 1분 분량의 전사 텍스트
            
        Returns:
            SummaryResult: 요약 결과 (summary, keywords, confidence)
        """
        _internal_result = await self._call_llm(transcript)
        return _internal_result
    
    # Private 메서드: _leading_underscore
    async def _call_llm(self, text: str) -> SummaryResult:
        ...
```

### Import 순서

```python
# 1. 표준 라이브러리
import os
from datetime import datetime
from typing import Optional

# 2. 서드파티 패키지
from fastapi import FastAPI, WebSocket
from pydantic import BaseModel
from sqlalchemy import select

# 3. 로컬 임포트
from src.core.config import settings
from src.services.llm.base import BaseLLM
from src.services.summarization.minute_summarizer import MinuteSummarizer
```

---

## 프로젝트 구조 규칙

### Service Layer Pattern

```
UI (Streamlit)
    ↓ HTTP/WebSocket 호출만
API (FastAPI Routes)
    ↓ Service 함수 호출만 (비즈니스 로직 X)
Services (비즈니스 로직)
    ↓ DB/File/외부 API 호출
Data Layer (SQLite, File System)
```

**금지 사항**:
- UI에서 Service를 직접 호출하지 않음 (반드시 API 경유)
- API Route에 비즈니스 로직을 넣지 않음
- Service에서 HTTP 응답 객체를 다루지 않음

### 새로운 기능 추가 체크리스트

1. `src/core/models.py`에 Pydantic 모델 추가
2. `src/services/`에 서비스 로직 구현
3. `src/api/routes/`에 API 엔드포인트 추가
4. `src/api/app.py`에 라우터 등록
5. `tests/unit/`에 단위 테스트 추가
6. `tests/integration/`에 통합 테스트 추가

---

## 테스트

### 실행

```bash
# 전체 테스트
pytest tests/ -v

# 단위 테스트만
pytest tests/unit/ -v

# 통합 테스트만
pytest tests/integration/ -v

# 커버리지 리포트
pytest tests/ -v --cov=src --cov-report=html
open htmlcov/index.html
```

### 테스트 구조

```
tests/
├── conftest.py              # 공통 fixture (DB, mock LLM)
├── unit/
│   ├── test_minute_summarizer.py   # 서비스 단위 테스트
│   ├── test_classifier.py
│   └── test_template_matcher.py
├── integration/
│   ├── test_pipeline.py     # E2E 파이프라인
│   └── test_websocket.py    # WebSocket 통합
└── fixtures/
    ├── sample_audio.wav     # 테스트 오디오
    └── sample_transcript.json
```

### 테스트 작성 규칙

```python
import pytest
from unittest.mock import AsyncMock, patch

class TestMinuteSummarizer:
    """MinuteSummarizer 단위 테스트"""
    
    @pytest.fixture
    def summarizer(self, mock_llm):
        return MinuteSummarizer(llm=mock_llm)
    
    @pytest.fixture
    def mock_llm(self):
        llm = AsyncMock(spec=BaseLLM)
        llm.summarize.return_value = SummaryResult(
            summary_text="테스트 요약",
            keywords=["테스트"],
            confidence=0.9
        )
        return llm
    
    async def test_summarize_returns_valid_result(self, summarizer):
        result = await summarizer.summarize_minute("테스트 전사본")
        assert result.confidence >= 0.0
        assert len(result.summary_text) > 0
    
    async def test_summarize_handles_empty_transcript(self, summarizer):
        result = await summarizer.summarize_minute("")
        assert result.confidence == 0.0
```

---

## Git 워크플로우

### Branch Strategy

```
main                 ← 안정 버전 (데모용)
└── develop          ← 개발 통합
    ├── feat/xxx     ← 기능 개발
    ├── fix/xxx      ← 버그 수정
    └── docs/xxx     ← 문서 작업
```

### Commit Message Convention

```
type(scope): description

# Types
feat     # 새 기능
fix      # 버그 수정
docs     # 문서
style    # 포맷팅 (세미콜론 등, 코드 변경 없음)
refactor # 리팩토링
test     # 테스트
chore    # 빌드, 설정 등

# Scopes
stt, llm, ui, api, storage, classification, template

# Examples
feat(stt): add Whisper WebSocket streaming endpoint
fix(classification): handle empty transcript edge case
docs(wiki): add API reference page
test(llm): add unit tests for Claude provider
chore(ci): update GitHub Actions Python version
```

### PR 워크플로우

1. `develop`에서 feature branch 생성
2. 구현 + 테스트 작성
3. `ruff check src/ tests/` 통과 확인
4. `pytest tests/ -v` 통과 확인
5. PR 생성 → develop 대상
6. (리뷰 후) Merge

---

## Linting & Formatting

```bash
# Lint 체크
ruff check src/ tests/

# 자동 수정
ruff check src/ tests/ --fix

# 포맷팅
ruff format src/ tests/

# 타입 체크 (선택)
mypy src/ --ignore-missing-imports
```

---

## 환경변수 관리

- `.env` 파일은 **절대 커밋하지 않음**
- `.env.example`에 키 이름과 설명만 포함
- API 키가 코드에 하드코딩되면 CI에서 경고

---

## 관련 문서

- [Architecture](Architecture) - 시스템 구조
- [API Reference](API-Reference) - 엔드포인트 명세
- [Deployment](Deployment) - 배포 가이드
