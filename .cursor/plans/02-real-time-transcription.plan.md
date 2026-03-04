---
name: Plan 02 - Real-Time Transcription
overview: whisper-cpp-node 기반 실시간 온디바이스 전사 파이프라인을 구축하고, 모델 관리/IPC 스트리밍/라이브 전사 UI를 포함한 전사 기능을 완성하기 위한 실행 플랜입니다.
todos:
  - id: whisper-service
    content: WhisperService를 구현해 모델 로드, 추론, 수명주기를 안정화한다.
    status: completed
  - id: model-management
    content: Whisper 모델 다운로드, 상태 확인, 선택/전환 흐름을 구현한다.
    status: completed
  - id: transcription-ipc
    content: 전사 시작/중지/세그먼트 이벤트 스트리밍 IPC 채널을 구현한다.
    status: completed
  - id: transcript-ui
    content: 실시간 세그먼트 렌더링, 타임스탬프, 자동 스크롤 UI를 구현한다.
    status: completed
  - id: transcription-tests
    content: 전사 핵심 플로우의 단위 및 스모크 검증을 추가한다.
    status: completed
isProject: true
---

# Plan 02: Real-Time Transcription

**Phase:** 1 — Core App
**Priority:** P0 (Foundation)
**Effort:** ~2 weeks
**Prerequisites:** Plan 01 (audio capture working)

## Overview

Integrate `whisper-cpp-node` for on-device speech-to-text with CoreML acceleration on macOS. Stream transcript segments to the renderer via IPC as they're produced. Display live transcription with word-level timestamps, auto-scroll, and language detection. Support model selection (base, small, medium, large-v3-turbo) with automatic downloading.

## Architecture

### Native Layer

- `src/main/services/WhisperService.ts` — wraps `whisper-cpp-node`, manages model lifecycle
- `src/main/ipc/transcription.ts` — IPC handlers for transcription control
- Models stored in `app.getPath('userData')/models/whisper/`

### IPC Bridge

- `whisper:transcribe-stream` — start streaming transcription
- `whisper:stop` — stop transcription
- `whisper:download-model` — download Whisper model
- `whisper:model-status` — check model availability
- `whisper:on-segment` — event channel for transcript segments

### React Layer

- `src/renderer/hooks/useTranscription.ts` — React hook wrapping IPC calls
- `src/renderer/components/Transcript/TranscriptView.tsx` — live transcript display
- `src/renderer/components/Transcript/SegmentRow.tsx` — individual segment with timestamp

## Implementation Steps

### 1. WhisperService Implementation (Main Process)

1. Install `whisper-cpp-node` dependency (`pnpm add whisper-cpp-node`)
2. Create `WhisperService` class wrapping Whisper context initialization
3. Implement model download with progress reporting (GGML files from Hugging Face)
4. Implement `transcribe()` method accepting audio buffer chunks
5. Configure CoreML provider detection (macOS) with CPU fallback (Linux/Windows)
6. Return segment stream: `{ text, start, end, language, confidence }`
7. Handle model lifecycle: load on first use, unload on app quit
8. Implement word-level timestamps via `max_len=1` token strategy

```typescript
// src/main/services/WhisperService.ts
import { Whisper } from 'whisper-cpp-node';
import { app } from 'electron';
import path from 'path';

export interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
  language: string;
  confidence: number;
  words?: { word: string; start: number; end: number }[];
}

export class WhisperService {
  private whisper: Whisper | null = null;
  private modelPath: string;

  constructor(private modelSize: 'base' | 'small' | 'medium' | 'large-v3-turbo' = 'base') {
    this.modelPath = path.join(app.getPath('userData'), 'models', 'whisper', `ggml-${modelSize}.bin`);
  }

  async initialize(): Promise<void> {
    if (!await this.isModelAvailable()) {
      throw new Error('Model not found. Download required.');
    }

    this.whisper = new Whisper({
      modelPath: this.modelPath,
      coreMLEnabled: process.platform === 'darwin',
      language: 'auto',
      translate: false,
      splitOnWord: true,
      maxLen: 1, // word-level timestamps
    });
  }

  async transcribe(audioBuffer: Float32Array, sampleRate: number): Promise<TranscriptSegment[]> {
    if (!this.whisper) await this.initialize();

    const result = await this.whisper!.transcribe(audioBuffer, {
      sampleRate,
      temperature: 0.0,
      beamSize: 5,
    });

    return result.segments.map(seg => ({
      text: seg.text.trim(),
      start: seg.startTime,
      end: seg.endTime,
      language: result.language,
      confidence: seg.confidence,
      words: seg.words,
    }));
  }

  async downloadModel(onProgress: (percent: number) => void): Promise<void> {
    // Download from HuggingFace: ggerganov/whisper.cpp
    const modelUrl = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${this.modelSize}.bin`;
    // ... implement download with progress
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
    this.whisper?.destroy();
    this.whisper = null;
  }
}
```

### 2. IPC Handlers (Main Process)

1. Create `src/main/ipc/transcription.ts`
2. Register handlers in `src/main/index.ts`
3. Stream segments via `webContents.send()` as they arrive
4. Handle errors and propagate to renderer

```typescript
// src/main/ipc/transcription.ts
import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { WhisperService, TranscriptSegment } from '../services/WhisperService';

let whisperService: WhisperService | null = null;

export function registerTranscriptionHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('whisper:transcribe-stream', async (event: IpcMainInvokeEvent, audioBuffer: Float32Array, sampleRate: number) => {
    if (!whisperService) {
      whisperService = new WhisperService();
      await whisperService.initialize();
    }

    const segments = await whisperService.transcribe(audioBuffer, sampleRate);

    // Stream each segment as it's produced
    segments.forEach(segment => {
      mainWindow.webContents.send('whisper:on-segment', segment);
    });

    return { success: true };
  });

  ipcMain.handle('whisper:stop', async () => {
    whisperService?.destroy();
    whisperService = null;
    return { success: true };
  });

  ipcMain.handle('whisper:download-model', async (event, modelSize: string, onProgress: (p: number) => void) => {
    const service = new WhisperService(modelSize as any);
    await service.downloadModel((percent) => {
      event.sender.send('whisper:download-progress', percent);
    });
    return { success: true };
  });

  ipcMain.handle('whisper:model-status', async (event, modelSize: string) => {
    const service = new WhisperService(modelSize as any);
    const available = await service.isModelAvailable();
    return { available };
  });
}
```

### 3. Preload API Surface (Preload Process)

1. Expose typed IPC methods via `contextBridge`
2. Type definitions in `src/shared/types.ts`

```typescript
// src/preload/index.ts (add to existing)
import { contextBridge, ipcRenderer } from 'electron';
import type { TranscriptSegment } from '../shared/types';

contextBridge.exposeInMainWorld('api', {
  // ... existing audio APIs

  transcription: {
    start: (audioBuffer: Float32Array, sampleRate: number) =>
      ipcRenderer.invoke('whisper:transcribe-stream', audioBuffer, sampleRate),

    stop: () =>
      ipcRenderer.invoke('whisper:stop'),

    onSegment: (callback: (segment: TranscriptSegment) => void) => {
      ipcRenderer.on('whisper:on-segment', (_, segment) => callback(segment));
    },

    downloadModel: (modelSize: string) =>
      ipcRenderer.invoke('whisper:download-model', modelSize),

    onDownloadProgress: (callback: (percent: number) => void) => {
      ipcRenderer.on('whisper:download-progress', (_, percent) => callback(percent));
    },

    checkModel: (modelSize: string) =>
      ipcRenderer.invoke('whisper:model-status', modelSize),
  },
});
```

### 4. React Hook (Renderer)

1. Create `src/renderer/hooks/useTranscription.ts`
2. Manage segment state, auto-scroll logic
3. Integrate with RecordingContext

```typescript
// src/renderer/hooks/useTranscription.ts
import { useState, useEffect, useCallback } from 'react';
import type { TranscriptSegment } from '@shared/types';

export function useTranscription() {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [language, setLanguage] = useState<string>('auto');

  useEffect(() => {
    const handleSegment = (segment: TranscriptSegment) => {
      setSegments(prev => [...prev, segment]);
      setLanguage(segment.language);
    };

    window.api.transcription.onSegment(handleSegment);
  }, []);

  const startTranscription = useCallback(async (audioBuffer: Float32Array, sampleRate: number) => {
    setIsTranscribing(true);
    setSegments([]);
    await window.api.transcription.start(audioBuffer, sampleRate);
  }, []);

  const stopTranscription = useCallback(async () => {
    await window.api.transcription.stop();
    setIsTranscribing(false);
  }, []);

  return {
    segments,
    isTranscribing,
    language,
    startTranscription,
    stopTranscription,
  };
}
```

### 5. UI Components (Renderer)

1. `TranscriptView.tsx` — scrollable transcript with auto-scroll
2. `SegmentRow.tsx` — timestamp + text with hover actions (copy, edit)
3. `LanguageBadge.tsx` — detected language indicator
4. Add to RecordingView layout

```typescript
// src/renderer/components/Transcript/TranscriptView.tsx
import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { SegmentRow } from './SegmentRow';
import { useTranscription } from '@/hooks/useTranscription';

export function TranscriptView() {
  const { segments, language } = useTranscription();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom on new segment
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [segments]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Transcript</h2>
        {language !== 'auto' && (
          <Badge variant="secondary">{language.toUpperCase()}</Badge>
        )}
      </div>

      <ScrollArea ref={scrollRef} className="flex-1">
        <div className="space-y-2 p-4">
          {segments.map((segment, idx) => (
            <SegmentRow key={idx} segment={segment} />
          ))}

          {segments.length === 0 && (
            <p className="text-muted-foreground text-center py-8">
              Start recording to see live transcription...
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
```

### 6. Database Schema Extension

1. Extend `recordings` table to store transcript segments
2. Add `transcript_segments` table with foreign key to recording

```sql
-- Migration: 002_add_transcripts.sql
CREATE TABLE IF NOT EXISTS transcript_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recording_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  start_time REAL NOT NULL,
  end_time REAL NOT NULL,
  language TEXT,
  confidence REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
);

CREATE INDEX idx_segments_recording ON transcript_segments(recording_id);
CREATE INDEX idx_segments_time ON transcript_segments(start_time);
```

### 7. Settings UI for Model Management

1. Add Settings page with model size selector
2. Show download progress bar
3. Display model file size and status (downloaded/missing)

## New Files

```
src/
├── main/
│   ├── services/
│   │   └── WhisperService.ts
│   └── ipc/
│       └── transcription.ts
├── renderer/
│   ├── components/
│   │   └── Transcript/
│   │       ├── TranscriptView.tsx
│   │       ├── SegmentRow.tsx
│   │       └── LanguageBadge.tsx
│   └── hooks/
│       └── useTranscription.ts
└── shared/
    └── types.ts (extend with TranscriptSegment)
```

## Database Schema

```sql
-- transcript_segments table
CREATE TABLE transcript_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recording_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  start_time REAL NOT NULL,     -- seconds
  end_time REAL NOT NULL,         -- seconds
  language TEXT,                  -- 'en', 'ko', 'ja', etc.
  confidence REAL,                -- 0.0 - 1.0
  words JSON,                     -- word-level timestamps [{"word": "...", "start": 0.0, "end": 0.5}]
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
);
```

## UI Components (shadcn/ui)


| Component        | Base                           | Purpose                                    |
| ---------------- | ------------------------------ | ------------------------------------------ |
| `TranscriptView` | `ScrollArea`                   | Main transcript container with auto-scroll |
| `SegmentRow`     | `Card`                         | Individual segment with timestamp badge    |
| `LanguageBadge`  | `Badge`                        | Detected language indicator                |
| Model settings   | `Select`, `Progress`, `Button` | Model download UI                          |


## Testing Strategy

### Unit Tests (Vitest)

- `WhisperService.test.ts` — mock `whisper-cpp-node`, test segment parsing
- `useTranscription.test.ts` — test hook state management with mock IPC

### E2E Tests (Playwright)

- Record 10s audio → verify transcript segments appear in UI
- Test language detection with multi-language audio
- Test model download flow in Settings

## Acceptance Criteria

- WhisperService initializes with CoreML on macOS, CPU fallback on Linux/Windows
- Model downloads show progress bar in Settings
- Base model auto-downloads on first transcription if missing
- Live transcript segments appear in UI within 1-2s of speech
- Auto-scroll keeps latest segment visible
- Detected language badge shows correct language code
- Segments persist to SQLite after recording stops
- Word-level timestamps available in segment data
- Clicking segment seeks audio playback to that timestamp (integration with Plan 01)
- Copy button on segment copies text to clipboard
- No UI blocking — transcription runs on main process, doesn't freeze renderer
- Error handling: missing model shows prompt to download
- Settings page allows switching between base/small/medium/large-v3-turbo models

## Edge Cases & Gotchas

- **First launch:** Base model not present → must download ~150 MB before first transcription
- **Slow devices:** Large-v3-turbo may be too slow on CPU-only systems → recommend base/small
- **Memory:** Whisper models load into RAM — large-v3-turbo uses ~3 GB
- **Audio format:** Whisper expects 16kHz mono Float32 — must resample if recording at different rate
- **Segment timing:** Whisper may produce overlapping segments — deduplicate by timestamp
- **Long recordings:** Transcribe in 30s chunks to keep UI responsive
- **Language detection confidence:** Low-confidence segments (<0.5) may be hallucinations — add visual indicator

## Performance Targets


| Metric                    | Target                                             |
| ------------------------- | -------------------------------------------------- |
| **Transcription latency** | <2s per 10s audio chunk (base model, CoreML)       |
| **UI responsiveness**     | 60 FPS during transcription                        |
| **Memory usage**          | <500 MB increase during transcription (base model) |
| **Model load time**       | <3s (base model, SSD)                              |


