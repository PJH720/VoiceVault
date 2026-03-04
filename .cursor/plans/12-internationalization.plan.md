---
name: Plan 12 - Internationalization
overview: react-i18next 기반 다국어 UI를 구축하고 locale 상태 저장, 번역 리소스 관리, 언어 전환 UX를 정착시키기 위한 실행 플랜입니다.
todos:
  - id: i18n-bootstrap
    content: i18n 초기화와 locale 리소스 로딩 구조를 구현한다.
    status: completed
  - id: locale-persistence
    content: 선택 언어를 저장하고 앱 재시작 시 복원하는 흐름을 구현한다.
    status: completed
  - id: string-externalization
    content: 사용자 노출 문자열을 로케일 파일로 이관하고 키 체계를 정리한다.
    status: completed
  - id: language-picker-ui
    content: 설정 화면 언어 선택 UI와 반영 흐름을 구현한다.
    status: completed
  - id: i18n-quality-gate
    content: 누락 키/포맷팅/locale fallback 동작을 검증한다.
    status: completed
isProject: true
---

# Plan 12: Internationalization (i18n)

**Phase:** 7 — Translation & i18n
**Priority:** P3 (Future Enhancement)
**Effort:** ~1.5 weeks
**Prerequisites:** Plan 01 (app shell), Plan 11 (translation pipeline)

## Overview

Implement full internationalization using `react-i18next` for the VoiceVault UI. Support Korean (primary), English, and Japanese from day one with a scalable locale system. All user-facing strings externalized to locale JSON files. Locale-aware date, number, and duration formatting. Language switcher in Settings. Contributor-friendly workflow for adding new languages.

## Architecture

### Native Layer

- `src/main/store.ts` — persist selected locale in `electron-store`
- `src/main/ipc/settings.ts` — IPC handler to get/set locale preference

### IPC Bridge

- `settings:get-locale` → returns current locale string
- `settings:set-locale` → persists locale, returns confirmation
- App menu labels also need i18n (main process `Menu.buildFromTemplate`)

### React Layer

- `src/renderer/i18n/index.ts` — `react-i18next` initialization
- `src/renderer/i18n/locales/ko.json` — Korean (primary)
- `src/renderer/i18n/locales/en.json` — English
- `src/renderer/i18n/locales/ja.json` — Japanese
- `src/renderer/hooks/useLocale.ts` — locale switching hook
- `src/renderer/components/Settings/LanguagePicker.tsx` — UI for language selection

### Shared Types

```typescript
// src/shared/types.ts (additions)
export type SupportedLocale = 'ko' | 'en' | 'ja';

export interface LocaleMetadata {
  code: SupportedLocale;
  name: string;           // "한국어", "English", "日本語"
  nativeName: string;     // same as name (for display in own language)
  direction: 'ltr' | 'rtl';
  complete: boolean;      // translation completeness flag
}
```

## Implementation Steps

### 1. Install Dependencies

```bash
pnpm add react-i18next i18next i18next-browser-languagedetector
```

### 2. Create Locale Files

Namespace structure — single flat namespace for simplicity at this scale:

```json
// src/renderer/i18n/locales/ko.json
{
  "app": {
    "name": "VoiceVault",
    "tagline": "AI 음성 녹음기"
  },
  "nav": {
    "library": "라이브러리",
    "record": "녹음",
    "settings": "설정",
    "search": "검색"
  },
  "recording": {
    "start": "녹음 시작",
    "stop": "녹음 중지",
    "pause": "일시정지",
    "resume": "계속",
    "elapsed": "경과 시간",
    "title_placeholder": "녹음 제목",
    "untitled": "제목 없는 녹음",
    "confirm_delete": "이 녹음을 삭제하시겠습니까?",
    "deleted": "녹음이 삭제되었습니다"
  },
  "library": {
    "empty": "아직 녹음이 없습니다",
    "empty_desc": "녹음 탭에서 첫 녹음을 시작하세요",
    "sort_date": "날짜순",
    "sort_title": "제목순",
    "sort_duration": "길이순",
    "search_placeholder": "녹음 검색...",
    "count": "{{count}}개의 녹음",
    "bookmarked": "북마크됨"
  },
  "player": {
    "play": "재생",
    "pause": "일시정지",
    "speed": "배속",
    "seek": "탐색"
  },
  "transcript": {
    "live": "실시간 전사",
    "loading": "전사 모델 로딩 중...",
    "no_transcript": "전사 내용이 없습니다",
    "speaker": "화자 {{number}}",
    "copy": "복사",
    "copied": "복사됨"
  },
  "summary": {
    "generate": "요약 생성",
    "generating": "요약 생성 중...",
    "key_points": "핵심 내용",
    "action_items": "액션 아이템",
    "decisions": "결정 사항"
  },
  "settings": {
    "title": "설정",
    "language": "언어",
    "audio_input": "오디오 입력 장치",
    "storage": "저장 경로",
    "model_management": "모델 관리",
    "about": "정보",
    "version": "버전"
  },
  "export": {
    "obsidian": "Obsidian으로 내보내기",
    "pdf": "PDF로 내보내기",
    "markdown": "Markdown으로 내보내기",
    "success": "내보내기 완료",
    "failed": "내보내기 실패"
  },
  "search": {
    "placeholder": "모든 녹음에서 검색...",
    "no_results": "결과가 없습니다",
    "results_count": "{{count}}개의 결과"
  },
  "common": {
    "save": "저장",
    "cancel": "취소",
    "delete": "삭제",
    "edit": "편집",
    "close": "닫기",
    "loading": "로딩 중...",
    "error": "오류가 발생했습니다",
    "retry": "다시 시도",
    "confirm": "확인"
  },
  "time": {
    "just_now": "방금 전",
    "minutes_ago": "{{count}}분 전",
    "hours_ago": "{{count}}시간 전",
    "days_ago": "{{count}}일 전",
    "duration_format": "{{hours}}시간 {{minutes}}분 {{seconds}}초"
  }
}
```

```json
// src/renderer/i18n/locales/en.json
{
  "app": {
    "name": "VoiceVault",
    "tagline": "AI Voice Recorder"
  },
  "nav": {
    "library": "Library",
    "record": "Record",
    "settings": "Settings",
    "search": "Search"
  },
  "recording": {
    "start": "Start Recording",
    "stop": "Stop Recording",
    "pause": "Pause",
    "resume": "Resume",
    "elapsed": "Elapsed",
    "title_placeholder": "Recording title",
    "untitled": "Untitled Recording",
    "confirm_delete": "Delete this recording?",
    "deleted": "Recording deleted"
  },
  "library": {
    "empty": "No recordings yet",
    "empty_desc": "Start your first recording from the Record tab",
    "sort_date": "By date",
    "sort_title": "By title",
    "sort_duration": "By duration",
    "search_placeholder": "Search recordings...",
    "count": "{{count}} recordings",
    "bookmarked": "Bookmarked"
  },
  "player": {
    "play": "Play",
    "pause": "Pause",
    "speed": "Speed",
    "seek": "Seek"
  },
  "transcript": {
    "live": "Live Transcription",
    "loading": "Loading transcription model...",
    "no_transcript": "No transcript available",
    "speaker": "Speaker {{number}}",
    "copy": "Copy",
    "copied": "Copied"
  },
  "summary": {
    "generate": "Generate Summary",
    "generating": "Generating summary...",
    "key_points": "Key Points",
    "action_items": "Action Items",
    "decisions": "Decisions"
  },
  "settings": {
    "title": "Settings",
    "language": "Language",
    "audio_input": "Audio Input Device",
    "storage": "Storage Path",
    "model_management": "Model Management",
    "about": "About",
    "version": "Version"
  },
  "export": {
    "obsidian": "Export to Obsidian",
    "pdf": "Export as PDF",
    "markdown": "Export as Markdown",
    "success": "Export complete",
    "failed": "Export failed"
  },
  "search": {
    "placeholder": "Search across all recordings...",
    "no_results": "No results found",
    "results_count": "{{count}} results"
  },
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "close": "Close",
    "loading": "Loading...",
    "error": "Something went wrong",
    "retry": "Retry",
    "confirm": "Confirm"
  },
  "time": {
    "just_now": "Just now",
    "minutes_ago": "{{count}}m ago",
    "hours_ago": "{{count}}h ago",
    "days_ago": "{{count}}d ago",
    "duration_format": "{{hours}}h {{minutes}}m {{seconds}}s"
  }
}
```

Japanese locale follows the same structure with `ja.json`.

### 3. i18n Initialization

```typescript
// src/renderer/i18n/index.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import ko from './locales/ko.json';
import en from './locales/en.json';
import ja from './locales/ja.json';

const resources = {
  ko: { translation: ko },
  en: { translation: en },
  ja: { translation: ja },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },   // React already escapes
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export default i18n;
```

### 4. Language Picker Component

```tsx
// src/renderer/components/Settings/LanguagePicker.tsx
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { SupportedLocale, LocaleMetadata } from '@shared/types';

const LOCALES: LocaleMetadata[] = [
  { code: 'ko', name: '한국어', nativeName: '한국어', direction: 'ltr', complete: true },
  { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr', complete: true },
  { code: 'ja', name: '日本語', nativeName: '日本語', direction: 'ltr', complete: true },
];

export function LanguagePicker() {
  const { i18n, t } = useTranslation();

  const handleChange = async (locale: SupportedLocale) => {
    await i18n.changeLanguage(locale);
    await window.electronAPI.setLocale(locale);  // persist to electron-store
  };

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium">{t('settings.language')}</span>
      <Select value={i18n.language as SupportedLocale} onValueChange={handleChange}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LOCALES.map((locale) => (
            <SelectItem key={locale.code} value={locale.code}>
              {locale.nativeName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

### 5. Usage Pattern in Components

```tsx
// Every component uses useTranslation
import { useTranslation } from 'react-i18next';

export function RecordingView() {
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t('recording.start')}</h1>
      <p>{t('recording.elapsed')}: {formatTime(elapsed)}</p>
    </div>
  );
}
```

**Forbidden patterns:**

```tsx
// ❌ NEVER hardcode user-facing strings
<button>Start Recording</button>
<p>No recordings yet</p>

// ✅ ALWAYS use t()
<button>{t('recording.start')}</button>
<p>{t('library.empty')}</p>
```

### 6. Locale-Aware Formatting

```typescript
// src/renderer/lib/format.ts
export function formatDate(date: string | Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(date));
}

export function formatDuration(seconds: number, locale: string): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  // Use Intl for locale-appropriate number formatting
  const nf = new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 });
  if (h > 0) return `${h}:${nf.format(m)}:${nf.format(s)}`;
  return `${m}:${nf.format(s)}`;
}

export function formatFileSize(bytes: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(size)} ${units[unitIndex]}`;
}
```

### 7. Main Process Menu i18n

```typescript
// src/main/menu.ts
import { Menu, app } from 'electron';
import Store from 'electron-store';

// Main process needs its own translation lookup (no React)
import ko from '../renderer/i18n/locales/ko.json';
import en from '../renderer/i18n/locales/en.json';
import ja from '../renderer/i18n/locales/ja.json';

const translations = { ko, en, ja } as const;

export function buildMenu(locale: string) {
  const t = (key: string) => {
    const keys = key.split('.');
    let result: unknown = translations[locale as keyof typeof translations] || translations.en;
    for (const k of keys) {
      result = (result as Record<string, unknown>)?.[k];
    }
    return (result as string) ?? key;
  };

  return Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { label: `${t('settings.about')} ${app.name}`, role: 'about' },
        { type: 'separator' },
        { label: t('settings.title'), accelerator: 'Cmd+,', click: () => { /* open settings */ } },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    // ... File, Edit, View, Window, Help menus
  ]);
}
```

### 8. Contributor Translation Guide

Create `TRANSLATING.md` at project root:

```markdown
# Contributing Translations

## Adding a New Language

1. Copy `src/renderer/i18n/locales/en.json` to `<locale-code>.json`
2. Translate all values (keep keys unchanged)
3. Add locale to `LOCALES` array in `LanguagePicker.tsx`
4. Add import in `src/renderer/i18n/index.ts`
5. Submit a PR

## Rules
- Keep interpolation variables intact: `{{count}}`, `{{number}}`
- Test in the app — some strings have length constraints
- Mark incomplete translations with `complete: false` in LocaleMetadata
```

## New Files

```
src/renderer/i18n/
├── index.ts                  # i18n initialization
└── locales/
    ├── ko.json               # Korean (primary)
    ├── en.json               # English
    └── ja.json               # Japanese
src/renderer/hooks/
└── useLocale.ts              # locale switching hook
src/renderer/components/Settings/
└── LanguagePicker.tsx         # language selection UI
src/renderer/lib/
└── format.ts                 # locale-aware formatting utils
src/main/
└── menu.ts                   # i18n-aware app menu
TRANSLATING.md                # contributor guide
```

## Testing Strategy

### Unit Tests (Vitest)

- `format.ts`: Verify date/duration/fileSize formatting across locales
- Translation completeness: Script that compares all locale files against `en.json` keys
- Interpolation: Verify `{{count}}` placeholders resolve correctly

### E2E Tests (Playwright)

- Switch language in Settings → verify UI labels change
- Verify fallback: unknown key shows English fallback
- Verify date formatting changes with locale
- Verify no raw untranslated strings in UI (screenshot comparison)

### Translation Lint Script

```typescript
// scripts/check-translations.ts
// Compare all locale files against en.json — flag missing keys
import en from '../src/renderer/i18n/locales/en.json';
import ko from '../src/renderer/i18n/locales/ko.json';
import ja from '../src/renderer/i18n/locales/ja.json';

function getKeys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' ? getKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  );
}

const enKeys = new Set(getKeys(en));
for (const [name, locale] of [['ko', ko], ['ja', ja]] as const) {
  const localeKeys = new Set(getKeys(locale));
  const missing = [...enKeys].filter(k => !localeKeys.has(k));
  if (missing.length) console.warn(`${name}: missing ${missing.length} keys`, missing);
}
```

## Acceptance Criteria

- `react-i18next` initialized with ko/en/ja locales
- All user-facing strings use `t()` — zero hardcoded strings
- Language picker in Settings works — UI updates instantly on switch
- Selected locale persists via `electron-store` across restarts
- Dates formatted with `Intl.DateTimeFormat` respecting locale
- Durations and file sizes formatted with `Intl.NumberFormat`
- App menu labels update on locale change (macOS)
- Fallback to English for missing translation keys
- `TRANSLATING.md` exists with contributor guide
- Translation lint script catches missing keys
- No `any` types — all locale types are strict
- Interpolation variables (`{{count}}`) work in all locales

## Edge Cases & Gotchas

- **Pluralization**: i18next supports plural forms (`count` interpolation) — Korean/Japanese don't have plural forms but the keys still need to exist
- **String length**: Korean/Japanese strings are often shorter than English — but German (future) can be 30% longer. Design UI with flexible widths.
- **RTL prep**: Current locales are all LTR, but structure supports adding `direction: 'rtl'` for Arabic/Hebrew later
- **Main process i18n**: Main process has no React — needs its own translation lookup for menus and dialogs
- **Hot-reload**: Changing language should not require app restart — `i18n.changeLanguage()` triggers React re-render
- **System locale detection**: `i18next-browser-languagedetector` may detect wrong locale in Electron — prefer reading from `electron-store` first, fallback to system

