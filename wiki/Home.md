# VoiceVault Wiki

> **Record your day, let AI organize it.**
> 하루종일 녹음하고, AI가 자동으로 정리하는 지능형 음성 비서

---

## Welcome

VoiceVault는 하루종일 연속 녹음해도 AI가 자동으로 **전사 · 요약 · 분류**해주는 오픈소스 음성 비서입니다.

강의 노트, 회의록, 친구 대화 기록, 아이디어 메모를 사용자가 정의한 템플릿에 따라 자동으로 구조화된 Markdown 문서로 생성합니다.

### 핵심 가치

| 원칙 | 설명 |
|------|------|
| **Local-First** | 모든 데이터는 사용자 기기에 저장. 클라우드 없이 100% 동작 |
| **Privacy by Design** | 제로 트래킹, GDPR/HIPAA 준수 가능 |
| **Provider Agnostic** | Claude, Ollama, OpenAI 등 사용자가 LLM 제공자 자유 선택 |
| **Open Source** | MIT 라이선스. 누구나 수정·배포 가능 |

---

## Quick Navigation

### 시작하기
- **[Getting Started](Getting-Started)** - 설치부터 첫 녹음까지
- **[User Guide](User-Guide)** - 기능별 사용 방법
- **[FAQ & Troubleshooting](FAQ-&-Troubleshooting)** - 자주 묻는 질문

### 기술 문서
- **[Architecture](Architecture)** - 시스템 아키텍처 & 레이어 설계
- **[Data Schema & Pipeline](Data-Schema-&-Pipeline)** - 데이터 흐름 & DB 스키마
- **[API Reference](API-Reference)** - REST & WebSocket 엔드포인트
- **[Template System](Template-System)** - 자동 분류 템플릿 설계

### 개발 & 운영
- **[Development Guide](Development-Guide)** - 개발 환경 설정 & 코딩 규칙
- **[Deployment](Deployment)** - Docker & 프로덕션 배포
- **[Roadmap](Roadmap)** - 마일스톤 & 향후 계획

---

## Project Overview

```
🎙️ 녹음 시작
    ↓
[Audio Stream] → Whisper STT → 실시간 전사
    ↓
[매 1분] → LLM 요약 (핵심 추출)
    ↓
[SQLite 저장] → 타임스탬프 + 요약 + 메타데이터
    ↓
🛑 녹음 종료
    ↓
[계층적 통합] → 1시간 단위 요약 압축
    ↓
[자동 분류] → Zero-shot + 사용자 템플릿 매칭
    ↓
📄 Markdown 문서 자동 생성 (강의 노트 / 회의록 / 대화 기록 / 메모)
```

---

## Tech Stack at a Glance

| Layer | Technology | Role |
|-------|-----------|------|
| **STT** | Whisper (OpenAI / Faster-Whisper) | 음성 → 텍스트 |
| **LLM** | Claude API / Ollama (Llama 3.2) | 요약 · 분류 · 생성 |
| **Backend** | FastAPI + WebSocket | API 서버 |
| **Frontend** | Streamlit | 웹 UI |
| **Database** | SQLite + SQLAlchemy | 로컬 데이터 저장 |
| **Infra** | Docker Compose | 컨테이너화 배포 |
| **CI/CD** | GitHub Actions | 자동 테스트 · 빌드 |

---

## Project Context

이 프로젝트는 **서강대학교 러너톤 2026** 해커톤에서 개발되었습니다.

- **기간**: 2026년 2월 (2주 MVP)
- **목표**: 1시간 녹음 → 5분 내 자동 분류·요약·MD 생성
- **라이선스**: MIT
- **Repository**: [github.com/voice-vault](https://github.com/)

---

## 기여하기

VoiceVault는 오픈소스 프로젝트입니다. 기여를 환영합니다!

- [Development Guide](Development-Guide) 참조
- [이슈 목록](https://github.com/) 확인
- `good first issue` 라벨로 입문자 친화적 이슈 제공
