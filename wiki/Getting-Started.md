# Getting Started

VoiceVault 설치부터 첫 녹음까지의 가이드입니다.

---

## 시스템 요구사항

### 최소 사양
| 항목 | 요구사항 |
|------|---------|
| **OS** | macOS 12+, Ubuntu 20.04+, Windows 10+ |
| **Python** | 3.12 (uv가 자동 관리) |
| **uv** | [설치 가이드](https://docs.astral.sh/uv/) |
| **RAM** | 4GB 이상 |
| **디스크** | 2GB 여유 공간 (Whisper 모델 포함) |
| **마이크** | 내장 또는 외장 마이크 |

### 권장 사양 (로컬 모델 사용 시)
| 항목 | 요구사항 |
|------|---------|
| **RAM** | 8GB 이상 |
| **GPU** | NVIDIA GPU 6GB+ VRAM (Whisper Turbo용) |
| **Ollama** | 최신 버전 설치 |

---

## 설치 방법

### 방법 1: 로컬 설치 (권장)

```bash
# 1. 리포지토리 클론
git clone https://github.com/<your-username>/voice-vault.git
cd voice-vault

# 2. uv로 Python 3.12 가상환경 생성 & 활성화
uv venv --python 3.12
source .venv/bin/activate        # macOS/Linux

# 3. 의존성 설치 (반드시 uv pip 사용)
uv pip install -r requirements.txt
uv pip install -e ".[dev]"

# 4. 환경변수 설정
cp .env.example .env
```

> **Note**: `pip` 대신 반드시 `uv pip`을 사용하세요. uv 환경에는 pip 바이너리가 포함되지 않습니다.

### 방법 2: Docker 설치

```bash
# 1. 리포지토리 클론
git clone https://github.com/<your-username>/voice-vault.git
cd voice-vault

# 2. 환경변수 설정
cp .env.example .env

# 3. Docker Compose 실행
docker-compose up -d

# 4. 브라우저에서 접속
# → http://localhost:8501
```

---

## 환경 설정 (.env)

`.env` 파일을 열고 사용 환경에 맞게 설정합니다.

### Case A: 완전 로컬 (인터넷 불필요)

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

WHISPER_PROVIDER=local
WHISPER_MODEL=base
```

> **사전 준비**: [Ollama](https://ollama.ai/) 설치 후 `ollama pull llama3.2` 실행

### Case B: 클라우드 API 사용

```env
LLM_PROVIDER=claude
CLAUDE_API_KEY=sk-ant-api03-YOUR_KEY_HERE
CLAUDE_MODEL=claude-3-5-sonnet-20241022

WHISPER_PROVIDER=api
WHISPER_API_KEY=sk-YOUR_OPENAI_KEY
WHISPER_MODEL=whisper-1
```

### Case C: 하이브리드 (STT 로컬 + LLM 클라우드)

```env
LLM_PROVIDER=claude
CLAUDE_API_KEY=sk-ant-api03-YOUR_KEY_HERE

WHISPER_PROVIDER=local
WHISPER_MODEL=base
```

---

## Whisper 모델 다운로드

로컬 STT를 사용하는 경우 Whisper 모델을 먼저 다운로드합니다.

```bash
python scripts/download_models.py
```

### 모델 크기별 비교

| 모델 | 크기 | VRAM | 정확도(WER) | 추천 |
|------|------|------|-----------|------|
| `tiny` | 39MB | ~1GB | ~15% | 빠른 테스트용 |
| **`base`** | **142MB** | **~1GB** | **~10%** | **MVP 추천** |
| `small` | 466MB | ~2GB | ~8% | 중간 |
| `medium` | 1.5GB | ~5GB | ~6% | 좋은 품질 |
| `turbo` | 809MB | ~6GB | ~8% | 최적 균형 (속도+품질) |
| `large-v3` | 3.1GB | ~10GB | ~5% | 최고 품질 |

---

## 실행하기

### 로컬 실행

두 개의 터미널이 필요합니다.

**터미널 1 - FastAPI 백엔드**
```bash
source .venv/bin/activate
uvicorn src.api.app:app --reload --host 0.0.0.0 --port 8000
```

**터미널 2 - Streamlit 프론트엔드**
```bash
source .venv/bin/activate
streamlit run src/ui/app.py --server.port 8501
```

### 접속

- **UI**: http://localhost:8501
- **API 문서 (Swagger)**: http://localhost:8000/docs
- **API 문서 (ReDoc)**: http://localhost:8000/redoc

---

## 첫 녹음 시작하기

### Step 1: 설정 확인
1. 브라우저에서 `http://localhost:8501` 접속
2. 좌측 사이드바 → Settings 페이지로 이동
3. STT Provider와 LLM Provider가 올바르게 설정되었는지 확인

### Step 2: 녹음 시작
1. Recording 페이지로 이동
2. 마이크 권한 허용 (브라우저 팝업)
3. **"Start Recording"** 버튼 클릭
4. 말하기 → 실시간 전사 확인

### Step 3: 요약 확인
1. **"Stop Recording"** 버튼 클릭
2. 1분 단위 요약이 자동 생성됨
3. Summaries 페이지에서 결과 확인

### Step 4: 내보내기
1. 원하는 요약 선택
2. **"Export as Markdown"** 버튼 클릭
3. `.md` 파일 다운로드

---

## 다음 단계

- [User Guide](User-Guide) - 모든 기능 상세 사용법
- [Template System](Template-System) - 자동 분류 템플릿 커스터마이징
- [Architecture](Architecture) - 시스템 구조 이해
