# ADR-003: 보안 및 샌드박싱 정책

| 항목 | 내용 |
|------|------|
| **상태** | ✅ Accepted |
| **날짜** | 2026-02-25 |
| **관련 이슈** | [#143](https://github.com/PJH720/VoiceVault/issues/143) |
| **결정자** | Jae-hyun Park |

---

## 1. 컨텍스트 (Context)

Obsidian Plugin은 사용자의 Vault에 직접 쓰기 권한을 가집니다. Electron 환경에서 실행되며, 잘못된 구현은 파일 손실·데이터 유출·XSS 공격으로 이어질 수 있습니다.

Obsidian Community Plugin 심사(Submission Requirements)는 구체적인 보안 규칙을 요구하며, 이를 충족하지 못하면 플러그인이 게시 거부됩니다.

이 ADR은 VoiceVault Plugin의 보안 정책 전체를 확정합니다.

---

## 2. 결정 (Decision)

### 2.1 DOM 조작 보안 규칙

#### ❌ 절대 금지
```typescript
// innerHTML — XSS 취약점의 직접 경로
element.innerHTML = userContent;          // ❌
el.outerHTML = `<div>${data}</div>`;     // ❌

// eval / Function 생성자
eval(code);                              // ❌
new Function('return ' + expr)();        // ❌

// document.write
document.write('<script>...</script>');  // ❌
```

#### ✅ 반드시 사용
```typescript
// Obsidian 네이티브 DOM API
const div = createDiv({ cls: 'voicevault-result' });
const span = createEl('span', { text: userContent });  // 자동 이스케이프

// 또는 Node API
const text = document.createTextNode(userContent);
el.appendChild(text);

// Markdown 렌더링이 필요한 경우
await MarkdownRenderer.renderMarkdown(content, container, sourcePath, this);
```

**규칙**: 모든 사용자 입력을 받는 DOM 노드는 반드시 `createEl()` 또는 `createDiv()`로 생성해야 합니다.

---

### 2.2 파일 경로 보안

#### ❌ 금지
```typescript
// 경로 탈출(path traversal) 취약점
const path = `VoiceVault/${userInput}/note.md`;       // ❌
const absPath = `/home/user/vault/` + filename;        // ❌
```

#### ✅ 반드시 사용
```typescript
import { normalizePath } from 'obsidian';

// normalizePath: 절대경로 탈출, 이중 슬래시 등 정규화
const safePath = normalizePath(`VoiceVault/Recordings/${date}/${filename}`);

// 파일명 sanitize 함수
function sanitizeFilename(name: string): string {
  // Obsidian 파일명 불허 문자: * " \ / < > : | ?
  return name.replace(/[*"\\/<>:|?]/g, '-').trim();
}
```

**규칙**: 파일 경로를 구성할 때는 반드시 `normalizePath()`를 통과시킵니다. 사용자 입력으로 생성되는 파일명은 `sanitizeFilename()`을 거칩니다.

---

### 2.3 API 키 및 시크릿 관리

| 데이터 | 저장 위치 | 방식 |
|--------|-----------|------|
| Backend URL | Obsidian Plugin Settings | `this.saveData({ backendUrl })` |
| API Key | Obsidian Plugin Settings | `this.saveData({ apiKey })` |
| 기타 시크릿 | **절대 코드에 하드코딩 금지** | — |

```typescript
// ✅ 올바른 설정 저장 패턴
interface VoiceVaultSettings {
  backendUrl: string;
  apiKey: string;
}

const DEFAULT_SETTINGS: VoiceVaultSettings = {
  backendUrl: 'http://localhost:8000',
  apiKey: '',                              // 기본값 빈 문자열
};

// 로드
await this.loadData();
// 저장
await this.saveData(this.settings);
```

**규칙**: API Key는 코드·로그·GitHub에 절대 노출 금지. `this.settings`는 Obsidian 관리 암호화 저장소에 보관됨.

---

### 2.4 네트워크 요청 보안

```typescript
// ✅ requestUrl 사용 (Obsidian 표준, CORS 우회)
import { requestUrl, RequestUrlParam } from 'obsidian';

const response = await requestUrl({
  url: `${this.settings.backendUrl}/api/v1/recordings`,
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${this.settings.apiKey}`,
    'Content-Type': 'application/json',
  },
  throw: false,   // 에러를 throw 대신 response.status로 처리
});

// ❌ fetch() 직접 사용 금지 (CORS 이슈, Obsidian 제출 심사 주의)
// fetch(url, { headers }) → 사용 금지
```

**HTTPS 정책**:
- 기본 URL이 `http://localhost`인 경우에만 HTTP 허용 (개발/로컬 사용)
- `http://localhost`가 아닌 모든 URL은 `https://` 강제 (설정 저장 시 검증)

```typescript
function validateBackendUrl(url: string): boolean {
  if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
    return true;   // 로컬 개발 허용
  }
  return url.startsWith('https://');  // 외부 서버는 HTTPS 필수
}
```

---

### 2.5 이벤트 리스너 관리

```typescript
// ❌ 수동 리스너 — 메모리 누수
document.addEventListener('keydown', handler);    // ❌ onunload에서 제거 어려움

// ✅ registerEvent — Obsidian이 onunload 시 자동 제거
this.registerEvent(
  this.app.workspace.on('file-open', this.handleFileOpen.bind(this))
);

// ✅ registerInterval — onunload 시 자동 클리어
this.registerInterval(
  window.setInterval(() => this.checkBackendHealth(), 30_000)
);
```

**규칙**: 모든 이벤트 리스너와 인터벌은 `registerEvent()` / `registerInterval()`로 등록. `onunload()`에서 수동 제거 코드 불필요.

---

### 2.6 서드파티 의존성 정책

| 규칙 | 내용 |
|------|------|
| 신규 의존성 추가 기준 | 표준 라이브러리로 대체 불가 + 활발한 유지보수 중(최근 6개월 내 커밋) |
| 취약점 스캔 | `npm audit` — 배포 전 HIGH/CRITICAL 0건 강제 |
| 번들 크기 | 추가 의존성은 `main.js` 크기 영향 검토 (Obsidian은 소형 플러그인 선호) |
| 허용 목록 | `obsidian` (API), `esbuild` (빌드) — 기타는 사전 승인 필요 |
| 금지 | Node.js 전용 모듈 (`fs`, `path`, `child_process`) — 모바일 호환 불가 |

---

### 2.7 Obsidian Submission Requirements 대응

Obsidian 공식 [Submission Requirements](https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins) 기준 체크리스트:

| # | 요구사항 | 정책 |
|---|----------|------|
| 1 | `innerHTML` 미사용 | §2.1: `createEl()` 강제 |
| 2 | `eval()` 미사용 | §2.1: eval 절대 금지 |
| 3 | `remote URL` fetch 시 사용자 동의 | 초기 설정 시 Backend URL 명시적 입력 요구 |
| 4 | 사용자 데이터 외부 전송 금지 | Plugin → Backend(로컬) 전용, 외부 서버 전송 없음 |
| 5 | `node:fs` 미사용 | `app.vault` API만 사용 (§2.2) |
| 6 | 번들에 `obsidian` 미포함 | `esbuild.config.mjs`에서 `external: ['obsidian']` 설정 |
| 7 | `manifest.json` 올바른 필드 | `id`, `name`, `version`, `minAppVersion` 필수 |
| 8 | no `console.log` in production | 프로덕션 빌드 시 `esbuild` drop: `['console']` 설정 |
| 9 | 민감 정보 로그 금지 | API Key 로그 출력 금지 (§2.3) |
| 10 | `requestUrl` 사용 | §2.4: fetch 대신 requestUrl |

---

## 3. 보안 체크리스트 (감사 시 사용)

아래 체크리스트는 #154 보안 감사 이슈에서 항목별 검증에 사용합니다.

- [ ] `innerHTML`, `outerHTML`, `document.write` 사용 0건
- [ ] `eval()`, `new Function()` 사용 0건
- [ ] 모든 파일 경로에 `normalizePath()` 적용
- [ ] 사용자 입력 파일명에 `sanitizeFilename()` 적용
- [ ] API Key 코드 하드코딩 0건
- [ ] API Key 로그 출력 0건
- [ ] 모든 이벤트 리스너 `registerEvent()` 또는 `registerInterval()` 사용
- [ ] 비로컬 URL은 HTTPS 강제 검증
- [ ] `fetch()` 직접 사용 0건 → `requestUrl()` 대체
- [ ] `node:fs`, `node:path`, `node:child_process` 사용 0건
- [ ] `npm audit` — HIGH/CRITICAL 0건
- [ ] `pip-audit` — HIGH/CRITICAL 0건
- [ ] `esbuild.config.mjs`에 `external: ['obsidian']` 설정
- [ ] 프로덕션 빌드 시 `console.log` 제거 설정

---

## 4. 결과 (Consequences)

### 긍정적 결과
- Obsidian Community Plugin 심사 통과 기반 확보
- XSS, 경로 탈출, 메모리 누수 등 주요 취약점 사전 차단
- 보안 체크리스트로 감사(#154) 자동화 가능

### 부정적 결과 / 트레이드오프
- `createEl()` API가 `innerHTML` 방식보다 코드 장황 → 개발 속도 약간 저하
- `requestUrl` 특유의 응답 타입(`RequestUrlResponse`) 처리 필요

### 이 ADR에 의존하는 이슈
- #146 Plugin Scaffold (innerHTML 금지, registerEvent 패턴)
- #151 Plugin HTTP Client (requestUrl, 에러 분류)
- #154 보안 감사 (이 문서의 체크리스트를 감사 기준으로 사용)

---

*Closes #143*
