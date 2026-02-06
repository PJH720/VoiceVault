# FAQ & Troubleshooting

자주 묻는 질문과 문제 해결 가이드입니다.

---

## 자주 묻는 질문 (FAQ)

### 일반

#### Q: VoiceVault는 무료인가요?

**A**: 네. 완전한 오픈소스(MIT 라이선스)이며, 모든 기능을 무료로 사용할 수 있습니다. Ollama를 사용하면 외부 API 비용도 발생하지 않습니다. Claude API를 선택하면 사용한 만큼의 API 비용이 사용자에게 직접 청구됩니다.

#### Q: 인터넷 없이 사용할 수 있나요?

**A**: 네. `LLM_PROVIDER=ollama` + `WHISPER_PROVIDER=local` 설정으로 100% 오프라인 동작합니다. 사전에 Ollama 모델과 Whisper 모델을 다운로드해 두어야 합니다.

#### Q: 하루 종일 녹음해도 되나요?

**A**: 네. 시스템은 내부적으로 1시간 단위로 데이터를 분할 처리하므로, 메모리와 디스크 공간이 충분하면 24시간 이상 연속 녹음이 가능합니다. 1시간 녹음 시 약 100-200MB의 오디오 파일이 생성됩니다.

#### Q: 어떤 언어를 지원하나요?

**A**: Whisper가 지원하는 모든 언어(99개)를 지원합니다. 한국어와 영어에 최적화되어 있으며, 다국어 혼합 인식도 가능합니다.

#### Q: 녹음 데이터는 어디에 저장되나요?

**A**: 모든 데이터는 사용자의 로컬 기기(`data/` 디렉토리)에만 저장됩니다. 외부 서버로 전송되지 않습니다. Claude API를 사용하는 경우, 전사 텍스트가 Anthropic 서버로 전송되지만 학습에 사용되지 않습니다.

---

### 기술

#### Q: Ollama와 Claude, 어떤 것을 사용해야 하나요?

**A**: 상황에 따라 다릅니다.

| 상황 | 추천 |
|------|------|
| 프라이버시 중요 | Ollama (완전 로컬) |
| 비용 절약 | Ollama (무료) |
| 최고 품질 | Claude (정확도 높음) |
| 빠른 응답 | Claude API (서버 처리) |
| 오프라인 사용 | Ollama (인터넷 불필요) |

#### Q: GPU가 없어도 사용할 수 있나요?

**A**: 네. Whisper `base` 모델은 CPU에서도 동작합니다 (다소 느림). Ollama도 CPU 모드를 지원합니다. GPU가 없으면 Claude API를 권장합니다.

#### Q: Whisper 모델은 어떤 것을 선택해야 하나요?

**A**: [Getting Started - Whisper 모델 비교표](Getting-Started#whisper-모델-다운로드) 참조. MVP에는 `base`를 추천합니다.

#### Q: 여러 사람의 목소리를 구분할 수 있나요?

**A**: 현재 MVP에서는 화자 분리(Speaker Diarization)를 지원하지 않습니다. 향후 Pyannote 3.1 통합으로 지원 예정입니다. 현재는 LLM이 어투 변화를 기반으로 화자를 추론합니다.

---

## 문제 해결 (Troubleshooting)

### 설치 관련

#### 문제: `pip install openai-whisper` 실패

**원인**: ffmpeg가 설치되지 않음

**해결**:
```bash
# macOS
brew install ffmpeg

# Ubuntu
sudo apt-get install ffmpeg

# Windows
# https://ffmpeg.org/download.html 에서 다운로드
```

#### 문제: `ModuleNotFoundError: No module named 'soundfile'`

**해결**:
```bash
# macOS
brew install libsndfile
pip install soundfile

# Ubuntu
sudo apt-get install libsndfile1
pip install soundfile
```

---

### 녹음 관련

#### 문제: 마이크가 인식되지 않음

**확인 사항**:
1. 브라우저에서 마이크 권한 허용했는지 확인
2. 시스템 설정에서 마이크 입력 디바이스 확인
3. 다른 앱이 마이크를 점유하고 있지 않은지 확인
4. HTTPS가 아닌 HTTP에서는 일부 브라우저가 마이크 차단 (localhost는 예외)

#### 문제: 전사 텍스트가 부정확함

**해결**:
1. Whisper 모델 업그레이드: `WHISPER_MODEL=small` 또는 `turbo`
2. 마이크를 소음 없는 환경에 배치
3. 언어 설정 확인: `WHISPER_LANGUAGE=ko` (자동 감지 대신)
4. 마이크 볼륨 조절

---

### LLM 관련

#### 문제: `Claude API Error: 401 Unauthorized`

**해결**:
1. `.env`에서 `CLAUDE_API_KEY` 확인
2. API 키가 유효한지 확인 (Anthropic Console)
3. 키에 잔여 크레딧이 있는지 확인

#### 문제: `Ollama connection refused`

**해결**:
```bash
# Ollama가 실행 중인지 확인
ollama list

# 실행되지 않은 경우
ollama serve

# 모델이 다운로드되었는지 확인
ollama list
# 없으면:
ollama pull llama3.2
```

#### 문제: 요약 결과가 잘려서 나옴

**원인**: LLM의 max_tokens 제한

**해결**: `src/core/config.py`에서 `MAX_SUMMARY_TOKENS` 값을 증가 (기본: 200 → 500)

---

### 성능 관련

#### 문제: 실시간 전사가 느림 (지연 > 5초)

**해결**:
1. Whisper 모델 다운그레이드: `WHISPER_MODEL=tiny` 또는 `base`
2. GPU 사용 확인: `torch.cuda.is_available()` → True
3. 다른 GPU 사용 프로세스 종료
4. Claude API 사용으로 전환 (서버 측 처리)

#### 문제: 메모리 사용량이 계속 증가

**해결**:
1. 장시간 녹음 후 Streamlit 페이지 새로고침
2. Whisper 모델 크기 축소
3. 1시간마다 자동 통합 요약으로 메모리 해제 확인

---

### Docker 관련

#### 문제: Docker 컨테이너에서 마이크 접근 불가

**해결**: Docker 컨테이너는 직접적인 하드웨어 접근이 제한됩니다. 마이크 입력은 **Streamlit UI (브라우저)**에서 JavaScript로 캡처하여 WebSocket으로 전송하므로, 브라우저의 마이크 권한만 필요합니다.

#### 문제: Ollama GPU가 Docker에서 인식되지 않음

**해결**:
```bash
# NVIDIA Container Toolkit 설치 확인
nvidia-smi

# docker-compose.yml에서 GPU 설정 확인
# deploy.resources.reservations.devices 섹션
```

---

## 도움 요청

문제가 해결되지 않으면:

1. [GitHub Issues](https://github.com/) 에서 기존 이슈 검색
2. 없으면 새 이슈 생성 (Bug Report 템플릿 사용)
3. 환경 정보(OS, Python 버전, 에러 로그) 반드시 포함

---

## 관련 문서

- [Getting Started](Getting-Started) - 설치 가이드
- [Deployment](Deployment) - Docker 배포
- [Development Guide](Development-Guide) - 개발 환경
