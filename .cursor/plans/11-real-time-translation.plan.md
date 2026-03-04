---
name: Plan 11 - Real-Time Translation
overview: 전사 세그먼트를 대상 언어로 실시간 번역해 이중 언어 전사를 제공하기 위해 번역 서비스, 캐시, 스트리밍 IPC, 번역 UI를 구축하는 실행 플랜입니다.
todos:
  - id: translation-service
    content: TranslationService를 구현해 단일/배치 번역을 지원한다.
    status: pending
  - id: language-support
    content: 지원 언어 목록과 타깃 언어 설정 흐름을 구현한다.
    status: pending
  - id: translation-cache
    content: 반복 구문 성능 개선을 위한 번역 캐시를 구현한다.
    status: pending
  - id: bilingual-transcript-ui
    content: 원문/번역문 병렬 표시와 품질 지표 UI를 구현한다.
    status: pending
  - id: translation-verification
    content: 지연시간/정확도/안정성 기준으로 번역 파이프라인을 검증한다.
    status: pending
isProject: true
---

# Plan 11: Real-Time Translation

**Phase:** 7 — Translation & i18n
**Priority:** P3 (Future Enhancement)
**Effort:** ~2 weeks
**Prerequisites:** Plan 02 (transcription), Plan 04 (local LLM)

## Overview

Implement real-time translation of transcript segments into target languages. Build translation pipeline (Whisper transcription → translation model → bilingual display). Support 100+ languages via local NLLB model or LLM-based translation. Display original and translated text side-by-side with quality indicators. Cache translations for performance.

## Architecture

### Native Layer
- `src/main/services/TranslationService.ts` — wraps translation model (NLLB or LLM)
- Translation models: NLLB-200 GGUF or prompt-based via node-llama-cpp
- Translation cache in SQLite for repeated phrases

### IPC Bridge
- `translation:translate` — translate single segment
- `translation:batch-translate` — translate multiple segments
- `translation:set-target-language` — configure target language
- `translation:get-languages` — list supported languages
- `translation:on-translated` — event channel for streaming translations

### React Layer
- `src/renderer/components/Translation/BilingualTranscript.tsx` — side-by-side original/translated
- `src/renderer/components/Translation/LanguageSelector.tsx` — target language picker
- `src/renderer/components/Translation/QualityIndicator.tsx` — translation quality badge

## Implementation Steps

### 1. Translation Service (Main Process)
1. Install NLLB model or use existing LLM for translation
2. Create `TranslationService` wrapping translation inference
3. Implement translation caching for performance
4. Support 100+ languages (ISO 639-1 codes)

```typescript
// src/main/services/TranslationService.ts
import { LlamaModel, LlamaContext } from 'node-llama-cpp';
import { app } from 'electron';
import path from 'path';
import type { Database } from 'better-sqlite3';

export interface TranslationResult {
  originalText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  confidence: number;
  model: string;
}

export class TranslationService {
  private model: LlamaModel | null = null;
  private context: LlamaContext | null = null;
  private modelPath: string;
  private cache: Map<string, string> = new Map();

  constructor(
    private db: Database,
    private modelName = 'gemma-2-3n-instruct' // Use existing LLM for translation
  ) {
    this.modelPath = path.join(app.getPath('userData'), 'models', 'llm', `${modelName}.gguf`);
    this.loadCacheFromDB();
  }

  async initialize(): Promise<void> {
    if (!await this.isModelAvailable()) {
      throw new Error('Translation model not found. Download required.');
    }

    this.model = new LlamaModel({
      modelPath: this.modelPath,
      gpuLayers: process.platform === 'darwin' ? 'max' : 0,
    });

    this.context = new LlamaContext({
      model: this.model,
      contextSize: 2048,
    });
  }

  async translate(
    text: string,
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<TranslationResult> {
    // Check cache first
    const cacheKey = this.getCacheKey(text, sourceLanguage, targetLanguage);
    if (this.cache.has(cacheKey)) {
      return {
        originalText: text,
        translatedText: this.cache.get(cacheKey)!,
        sourceLanguage,
        targetLanguage,
        confidence: 1.0,
        model: 'cached',
      };
    }

    if (!this.context) await this.initialize();

    const prompt = this.buildTranslationPrompt(text, sourceLanguage, targetLanguage);

    let translation = '';

    await this.context!.evaluate(prompt, {
      temperature: 0.3,
      topK: 40,
      topP: 0.9,
      maxTokens: 512,
      onToken: (chunk) => {
        translation += chunk;
      },
    });

    translation = translation.trim();

    // Save to cache
    this.cache.set(cacheKey, translation);
    this.saveCacheToDB(cacheKey, translation);

    return {
      originalText: text,
      translatedText: translation,
      sourceLanguage,
      targetLanguage,
      confidence: 0.85, // LLM translations assumed reasonably confident
      model: this.modelName,
    };
  }

  async batchTranslate(
    segments: Array<{ text: string; id: number }>,
    sourceLanguage: string,
    targetLanguage: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<Map<number, TranslationResult>> {
    const results = new Map<number, TranslationResult>();

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const result = await this.translate(segment.text, sourceLanguage, targetLanguage);
      results.set(segment.id, result);
      onProgress?.(i + 1, segments.length);
    }

    return results;
  }

  private buildTranslationPrompt(text: string, sourceLanguage: string, targetLanguage: string): string {
    const langNames = this.getLanguageNames();

    return `Translate the following text from ${langNames[sourceLanguage] || sourceLanguage} to ${langNames[targetLanguage] || targetLanguage}.

Rules:
- Translate ONLY the text, do not add explanations
- Preserve the tone and meaning
- Keep technical terms if appropriate
- Output ONLY the translation

Text to translate:
${text}

Translation:`;
  }

  private getLanguageNames(): Record<string, string> {
    return {
      'en': 'English',
      'ko': 'Korean',
      'ja': 'Japanese',
      'zh': 'Chinese',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ru': 'Russian',
      'ar': 'Arabic',
      'hi': 'Hindi',
      // ... 100+ languages
    };
  }

  getSupportedLanguages(): Array<{ code: string; name: string }> {
    const langNames = this.getLanguageNames();
    return Object.entries(langNames).map(([code, name]) => ({ code, name }));
  }

  private getCacheKey(text: string, sourceLanguage: string, targetLanguage: string): string {
    return `${sourceLanguage}:${targetLanguage}:${text.slice(0, 100)}`;
  }

  private loadCacheFromDB(): void {
    try {
      const rows = this.db.prepare('SELECT cache_key, translation FROM translation_cache').all() as any[];
      rows.forEach(row => {
        this.cache.set(row.cache_key, row.translation);
      });
    } catch {
      // Cache table may not exist yet
    }
  }

  private saveCacheToDB(cacheKey: string, translation: string): void {
    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO translation_cache (cache_key, translation)
        VALUES (?, ?)
      `).run(cacheKey, translation);
    } catch (error) {
      console.warn('Failed to save translation to cache:', error);
    }
  }

  async isModelAvailable(): Promise<boolean> {
    const fs = await import('fs/promises');
    try {
      await fs.access(this.modelPath);
      return true;
    } catch {
      return false;
    }
  }

  destroy(): void {
    this.context?.dispose();
    this.context = null;
    this.model?.dispose();
    this.model = null;
  }
}
```

### 2. Database Schema Extension
```sql
-- Migration: 008_translations.sql
CREATE TABLE IF NOT EXISTS translation_cache (
  cache_key TEXT PRIMARY KEY,
  translation TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS translated_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  segment_id INTEGER NOT NULL,
  target_language TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  confidence REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (segment_id) REFERENCES transcript_segments(id) ON DELETE CASCADE
);

CREATE INDEX idx_translated_segments_segment ON translated_segments(segment_id);
CREATE INDEX idx_translated_segments_language ON translated_segments(target_language);
```

### 3. IPC Handlers (Main Process)
```typescript
// src/main/ipc/translation.ts
import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron';
import { TranslationService } from '../services/TranslationService';
import { db } from '../services/DatabaseService';

let translationService: TranslationService;

export function registerTranslationHandlers(mainWindow: BrowserWindow): void {
  translationService = new TranslationService(db);

  ipcMain.handle('translation:translate', async (event, text: string, sourceLang: string, targetLang: string) => {
    const result = await translationService.translate(text, sourceLang, targetLang);
    return result;
  });

  ipcMain.handle('translation:batch-translate', async (event, segments: any[], sourceLang: string, targetLang: string) => {
    const results = await translationService.batchTranslate(segments, sourceLang, targetLang, (current, total) => {
      event.sender.send('translation:on-progress', { current, total });
    });

    // Convert Map to array for IPC
    return Array.from(results.entries()).map(([id, result]) => ({ id, result }));
  });

  ipcMain.handle('translation:get-languages', async () => {
    const languages = translationService.getSupportedLanguages();
    return { languages };
  });

  ipcMain.handle('translation:set-target-language', async (event, language: string) => {
    // Store in electron-store
    store.set('translationTargetLanguage', language);
    return { success: true };
  });

  ipcMain.handle('translation:get-target-language', async () => {
    return { language: store.get('translationTargetLanguage', 'en') };
  });
}
```

### 4. Preload API (Preload Process)
```typescript
// src/preload/index.ts (extend)
contextBridge.exposeInMainWorld('api', {
  // ... existing APIs

  translation: {
    translate: (text: string, sourceLang: string, targetLang: string) =>
      ipcRenderer.invoke('translation:translate', text, sourceLang, targetLang),

    batchTranslate: (segments: any[], sourceLang: string, targetLang: string) =>
      ipcRenderer.invoke('translation:batch-translate', segments, sourceLang, targetLang),

    onProgress: (callback: (progress: { current: number; total: number }) => void) => {
      ipcRenderer.on('translation:on-progress', (_, progress) => callback(progress));
    },

    getLanguages: () => ipcRenderer.invoke('translation:get-languages'),

    setTargetLanguage: (language: string) =>
      ipcRenderer.invoke('translation:set-target-language', language),

    getTargetLanguage: () =>
      ipcRenderer.invoke('translation:get-target-language'),
  },
});
```

### 5. React Hook (Renderer)
```typescript
// src/renderer/hooks/useTranslation.ts
import { useState, useEffect, useCallback } from 'react';

export function useTranslation() {
  const [targetLanguage, setTargetLanguage] = useState<string>('en');
  const [languages, setLanguages] = useState<Array<{ code: string; name: string }>>([]);
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    loadLanguages();
    loadTargetLanguage();

    window.api.translation.onProgress((p) => setProgress(p));
  }, []);

  const loadLanguages = async () => {
    const { languages } = await window.api.translation.getLanguages();
    setLanguages(languages);
  };

  const loadTargetLanguage = async () => {
    const { language } = await window.api.translation.getTargetLanguage();
    setTargetLanguage(language);
  };

  const changeTargetLanguage = useCallback(async (language: string) => {
    await window.api.translation.setTargetLanguage(language);
    setTargetLanguage(language);
  }, []);

  const translateSegment = useCallback(async (text: string, sourceLang: string) => {
    setIsTranslating(true);
    try {
      const result = await window.api.translation.translate(text, sourceLang, targetLanguage);
      return result;
    } finally {
      setIsTranslating(false);
    }
  }, [targetLanguage]);

  const translateBatch = useCallback(async (segments: any[], sourceLang: string) => {
    setIsTranslating(true);
    setProgress({ current: 0, total: segments.length });

    try {
      const results = await window.api.translation.batchTranslate(segments, sourceLang, targetLanguage);
      return results;
    } finally {
      setIsTranslating(false);
    }
  }, [targetLanguage]);

  return {
    targetLanguage,
    languages,
    isTranslating,
    progress,
    changeTargetLanguage,
    translateSegment,
    translateBatch,
  };
}
```

### 6. UI Components (Renderer)
```typescript
// src/renderer/components/Translation/BilingualTranscript.tsx
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface Props {
  segments: Array<{ id: number; text: string; language: string; start: number }>;
}

export function BilingualTranscript({ segments }: Props) {
  const { targetLanguage, translateBatch, isTranslating, progress } = useTranslation();
  const [translations, setTranslations] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    // Auto-translate when target language changes
    if (segments.length > 0) {
      translateAllSegments();
    }
  }, [targetLanguage, segments]);

  const translateAllSegments = async () => {
    const results = await translateBatch(
      segments.map(s => ({ id: s.id, text: s.text })),
      segments[0]?.language || 'en'
    );

    const translationMap = new Map<number, string>();
    results.forEach(({ id, result }: any) => {
      translationMap.set(id, result.translatedText);
    });

    setTranslations(translationMap);
  };

  if (isTranslating && translations.size === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>Translating {progress.current} / {progress.total}...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {segments.map(segment => (
        <Card key={segment.id} className="p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Badge variant="outline" className="mb-2">
                Original ({segment.language.toUpperCase()})
              </Badge>
              <p className="text-sm leading-relaxed">{segment.text}</p>
            </div>

            <div className="border-l pl-4">
              <Badge variant="outline" className="mb-2">
                Translation ({targetLanguage.toUpperCase()})
              </Badge>
              {translations.has(segment.id) ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {translations.get(segment.id)}
                </p>
              ) : (
                <div className="flex items-center text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Translating...
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
```

```typescript
// src/renderer/components/Translation/LanguageSelector.tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/hooks/useTranslation';

export function LanguageSelector() {
  const { languages, targetLanguage, changeTargetLanguage } = useTranslation();

  return (
    <div>
      <Label>Translation Language</Label>
      <Select value={targetLanguage} onValueChange={changeTargetLanguage}>
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {languages.map(lang => (
            <SelectItem key={lang.code} value={lang.code}>
              {lang.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

## New Files

```
src/
├── main/
│   ├── services/
│   │   └── TranslationService.ts
│   ├── ipc/
│   │   └── translation.ts
│   └── migrations/
│       └── 008_translations.sql
└── renderer/
    ├── hooks/
    │   └── useTranslation.ts
    └── components/
        └── Translation/
            ├── BilingualTranscript.tsx
            ├── LanguageSelector.tsx
            └── QualityIndicator.tsx
```

## Testing Strategy

### Unit Tests
- `TranslationService.test.ts` — mock LLM, test translation caching
- `useTranslation.test.ts` — test hook state management

### E2E Tests
- Select target language → verify segments translated
- Translate batch → verify progress updates
- Cache test: translate same text twice → verify cached on second call

## Acceptance Criteria

- [ ] Translation service initializes with existing LLM
- [ ] Target language selectable from 100+ languages
- [ ] Bilingual transcript displays original + translation side-by-side
- [ ] Translation cache works (repeated phrases use cache)
- [ ] Batch translation shows progress bar
- [ ] Translations persist to database
- [ ] Translation quality acceptable for common languages (EN, ES, FR, DE, ZH, JA, KO)
- [ ] Cache cleared when target language changes
- [ ] Translation toggle (on/off) in UI
- [ ] Quality indicator shows confidence score

## Edge Cases & Gotchas

- **Long segments:** LLM context limit — split long segments into chunks
- **Rare languages:** Translation quality may be poor for low-resource languages
- **Technical terms:** May be mistranslated — add glossary support (future)
- **Cache invalidation:** Clear cache when translation model changes
- **UI language vs translation language:** UI language (i18n) is separate from transcript translation
- **Performance:** Translating 1-hour recording may take 5-10 minutes on CPU

## Performance Targets

| Metric | Target |
|--------|--------|
| **Translation speed** | ~5 segments/second (batch, with cache) |
| **Cache hit rate** | >30% for repeated phrases |
| **Memory usage** | <500 MB increase during translation |
| **Latency (single segment)** | <2s for 20-word segment |

## Future Enhancements

- [ ] NLLB-200 model integration (better quality than LLM prompting)
- [ ] Offline translation models per language
- [ ] Custom glossaries for domain-specific terms
- [ ] Translation memory across recordings
- [ ] Real-time streaming translation (translate as transcription happens)
