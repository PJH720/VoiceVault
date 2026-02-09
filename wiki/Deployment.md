# Deployment

VoiceVault를 로컬 및 프로덕션 환경에 배포하는 가이드입니다.

---

## 배포 옵션

| 방법 | 난이도 | 대상 | 추천 |
|------|--------|------|------|
| **Docker Compose** | 쉬움 | 로컬 / 데모 | MVP 추천 |
| **수동 설치** | 중간 | 개발 / 디버깅 | 개발용 |
| **클라우드 배포** | 어려움 | 프로덕션 | 향후 |

---

## Docker Compose 배포 (추천)

### docker-compose.yml

```yaml
version: '3.8'

services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    volumes:
      - ./data:/app/data
      - ./.env:/app/.env
    environment:
      - DATABASE_URL=sqlite:///data/voicevault.db
    restart: unless-stopped

  frontend:
    build:
      context: .
      dockerfile: Dockerfile.streamlit
    ports:
      - "8501:8501"
    environment:
      - API_BASE_URL=http://backend:8000
    depends_on:
      - backend
    restart: unless-stopped

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]
    restart: unless-stopped

volumes:
  ollama_data:
```

### 실행

```bash
# 1. 환경변수 설정
cp .env.example .env
# .env 편집

# 2. 빌드 & 실행
docker-compose up -d

# 3. Ollama 모델 다운로드 (최초 1회)
docker exec -it voice-vault-ollama-1 ollama pull llama3.2

# 4. 접속
# UI: http://localhost:8501
# API: http://localhost:8000/docs

# 5. 로그 확인
docker-compose logs -f

# 6. 중지
docker-compose down
```

---

## Dockerfile

### Backend (FastAPI + Whisper)

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# 시스템 의존성 (audio processing)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# uv 설치 & Python 의존성
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
COPY requirements.txt .
RUN uv pip install --system --no-cache -r requirements.txt

# Whisper 모델 다운로드 (base)
RUN python -c "import whisper; whisper.load_model('base')"

# 소스 코드 복사
COPY src/ ./src/
COPY templates/ ./templates/
COPY scripts/ ./scripts/

# 데이터 디렉토리 생성
RUN mkdir -p data/recordings data/exports

# 기본 템플릿 시드
RUN python scripts/seed_templates.py || true

EXPOSE 8000

CMD ["uvicorn", "src.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Frontend (Streamlit)

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
COPY requirements.txt .
RUN uv pip install --system --no-cache streamlit httpx

COPY src/ui/ ./src/ui/

EXPOSE 8501

CMD ["streamlit", "run", "src/ui/app.py", \
     "--server.port=8501", \
     "--server.address=0.0.0.0", \
     "--server.headless=true"]
```

---

## 수동 설치 (개발용)

[Getting Started](Getting-Started) 페이지를 참조하세요.

---

## CI/CD (GitHub Actions)

### CI 파이프라인 (자동)

모든 `push` 및 `pull_request`에서 자동 실행:

1. **Ruff Lint** - 코드 스타일 검사
2. **pytest** - 테스트 실행
3. **Coverage** - 커버리지 리포트

### CD 파이프라인 (수동 / 향후)

```yaml
# .github/workflows/deploy.yml (향후 구현)
name: Deploy

on:
  push:
    tags: ['v*']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build Docker image
        run: docker build -t voice-vault:${{ github.ref_name }} .
      - name: Push to GHCR
        run: |
          echo ${{ secrets.GITHUB_TOKEN }} | docker login ghcr.io -u ${{ github.actor }} --password-stdin
          docker push ghcr.io/${{ github.repository }}:${{ github.ref_name }}
```

---

## 데이터 백업

### 백업 대상

| 항목 | 경로 | 중요도 |
|------|------|--------|
| 데이터베이스 | `data/voicevault.db` | 필수 |
| 오디오 파일 | `data/recordings/` | 선택 |
| 내보내기 파일 | `data/exports/` | 선택 |
| 환경 설정 | `.env` | 필수 |
| 커스텀 템플릿 | DB 내 templates 테이블 | 필수 |

### 백업 방법

```bash
# SQLite DB 백업
cp data/voicevault.db data/voicevault_backup_$(date +%Y%m%d).db

# 전체 data 디렉토리 백업
tar -czf backup_$(date +%Y%m%d).tar.gz data/
```

---

## 성능 튜닝

### Whisper 모델 선택

| 시나리오 | 모델 | VRAM |
|---------|------|------|
| 리소스 부족 (CPU만) | `tiny` / `base` | < 1GB |
| 일반 노트북 (GPU) | `base` / `small` | 1-2GB |
| 고성능 GPU | `turbo` | 6GB |
| 최고 품질 | `large-v3` | 10GB |

### LLM 비용 최적화

- **개발/테스트**: Ollama (무료)
- **프로덕션 (소량)**: Claude API 표준
- **프로덕션 (대량)**: Claude Batch API (50% 할인)

---

## 관련 문서

- [Getting Started](Getting-Started) - 초기 설정
- [Architecture](Architecture) - 시스템 구조
- [Development Guide](Development-Guide) - 개발 가이드
