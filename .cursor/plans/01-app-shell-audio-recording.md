# Plan 01: App Shell & Audio Recording

**Phase:** 1 — Core App  
**Priority:** P0 (Foundation)  
**Effort:** ~2 weeks  
**Prerequisites:** None — this is the starting point

## Overview

Build the VoiceVault Electron app foundation: electron-vite project scaffold, BrowserWindow with sidebar navigation, microphone audio capture via `native-audio-node` (CoreAudio on macOS), `better-sqlite3` persistence for recordings, a recording library view, audio playback with seek, and basic waveform visualization. This plan delivers a fully functional cross-platform voice recorder.

## Architecture

### Main Process
- `src/main/index.ts` — App entry, BrowserWindow creation, tray icon
- `src/main/services/AudioCaptureService.ts` — wraps `native-audio-node` for mic input
- `src/main/services/DatabaseService.ts` — `better-sqlite3` setup, schema, migrations
- `src/main/ipc/audio.ts` — IPC handlers for recording lifecycle
- `src/main/ipc/database.ts` — IPC handlers for CRUD operations
- `src/main/store.ts` — `electron-store` for user preferences

### IPC Bridge
- `audio:start-recording` — begin mic capture, return stream ID
- `audio:stop-recording` — stop capture, finalize WAV file, return metadata
- `audio:get-levels` — event channel streaming audio levels for waveform
- `audio:request-permission` — trigger mic permission dialog (macOS)
- `db:recordings:list` — query recordings with filters/sort/pagination
- `db:recordings:get` — get single recording by ID
- `db:recordings:delete` — delete recording + audio file
- `db:recordings:update` — update recording metadata (title, category)

### React Layer
- `src/renderer/App.tsx` — root with sidebar navigation
- `src/renderer/components/Recording/RecordingView.tsx` — record button, timer, waveform
- `src/renderer/components/Library/LibraryView.tsx` — recording list with search/sort
- `src/renderer/components/Library/RecordingDetail.tsx` — playback, metadata
- `src/renderer/components/ui/Waveform.tsx` — canvas-based real-time waveform
- `src/renderer/contexts/RecordingContext.tsx` — recording state management
- `src/renderer/hooks/useRecording.ts` — recording lifecycle hook
- `src/renderer/hooks/useAudioPlayer.ts` — HTML5 Audio playback hook

### Shared Types
```typescript
// src/shared/types.ts
export interface Recording {
  id: number;
  title: string;
  createdAt: string;       // ISO 8601
  duration: number;        // seconds
  audioPath: string;       // absolute path to WAV file
  category?: string;
  isBookmarked: boolean;
  fileSizeBytes: number;
}

export interface AudioLevelEvent {
  streamId: string;
  rms: number;             // 0.0–1.0 normalized
  peak: number;
  timestamp: number;       // ms since recording start
}

export interface RecordingResult {
  id: number;
  audioPath: string;
  duration: number;
  fileSizeBytes: number;
}
```

## Implementation Steps

### 1. Project Scaffold
1. Initialize with `pnpm create electron-vite@latest voicevault -- --template react-ts`
2. Configure `electron.vite.config.ts` with path aliases (`@renderer/`, `@main/`, `@shared/`)
3. Add `forge.config.ts` for packaging (macOS `.dmg`, Linux `.AppImage`, Windows `.exe`)
4. Configure `tsconfig.json` — strict mode, `noUncheckedIndexedAccess`, path mapping
5. Add `.gitignore`: `node_modules/`, `dist/`, `out/`, `*.wav`, `models/`, `.env`
6. Install core deps:
   ```bash
   pnpm add electron-store better-sqlite3 native-audio-node
   pnpm add -D @types/better-sqlite3
   ```
7. Install UI deps:
   ```bash
   pnpm add tailwindcss@next @tailwindcss/vite
   pnpm dlx shadcn@latest init
   ```

### 2. Main Process Entry
1. Create `src/main/index.ts`:
   - `BrowserWindow` with `contextIsolation: true`, `sandbox: true`
   - Preload script path
   - Window size 1200×800, min 900×600
   - Tray icon with quick-record action
   - `app.setPath('userData')` for portable data
2. macOS entitlements: `com.apple.security.device.audio-input`
3. CSP meta tag in `index.html`

### 3. Preload Bridge
```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Audio
  startRecording: () => ipcRenderer.invoke('audio:start-recording'),
  stopRecording: () => ipcRenderer.invoke('audio:stop-recording'),
  onAudioLevel: (cb: (level: AudioLevelEvent) => void) =>
    ipcRenderer.on('audio:level', (_e, level) => cb(level)),
  requestMicPermission: () => ipcRenderer.invoke('audio:request-permission'),

  // Database
  listRecordings: (opts?: ListOptions) => ipcRenderer.invoke('db:recordings:list', opts),
  getRecording: (id: number) => ipcRenderer.invoke('db:recordings:get', id),
  deleteRecording: (id: number) => ipcRenderer.invoke('db:recordings:delete', id),
  updateRecording: (id: number, data: Partial<Recording>) =>
    ipcRenderer.invoke('db:recordings:update', id, data),

  // App
  getAppPath: (name: string) => ipcRenderer.invoke('app:get-path', name),
});
```

### 4. Database Schema
```typescript
// src/main/services/DatabaseService.ts
import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';

const DB_PATH = path.join(app.getPath('userData'), 'voicevault.db');

export class DatabaseService {
  private db: Database.Database;

  constructor() {
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS recordings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        duration REAL NOT NULL DEFAULT 0,
        audio_path TEXT NOT NULL,
        category TEXT,
        is_bookmarked INTEGER NOT NULL DEFAULT 0,
        file_size_bytes INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_recordings_created_at ON recordings(created_at);
      CREATE INDEX IF NOT EXISTS idx_recordings_category ON recordings(category);
    `);
  }

  listRecordings(opts?: { search?: string; sort?: string; limit?: number; offset?: number }) {
    let sql = 'SELECT * FROM recordings';
    const params: unknown[] = [];
    if (opts?.search) {
      sql += ' WHERE title LIKE ?';
      params.push(`%${opts.search}%`);
    }
    sql += ` ORDER BY ${opts?.sort === 'title' ? 'title' : 'created_at'} DESC`;
    if (opts?.limit) { sql += ' LIMIT ?'; params.push(opts.limit); }
    if (opts?.offset) { sql += ' OFFSET ?'; params.push(opts.offset); }
    return this.db.prepare(sql).all(...params);
  }

  // ... insert, get, update, delete with prepared statements
}
```

### 5. Audio Capture Service
```typescript
// src/main/services/AudioCaptureService.ts
import { NativeAudio } from 'native-audio-node';
import { BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

export class AudioCaptureService {
  private audio: NativeAudio | null = null;
  private outputPath: string | null = null;
  private startTime: number = 0;

  async startRecording(outputDir: string): Promise<string> {
    const filename = `recording-${Date.now()}.wav`;
    this.outputPath = path.join(outputDir, filename);

    this.audio = new NativeAudio({
      sampleRate: 16000,
      channels: 1,
      format: 'f32',
    });

    this.startTime = Date.now();
    await this.audio.start();

    // Stream audio levels to renderer
    this.audio.on('data', (buffer: Float32Array) => {
      const rms = Math.sqrt(buffer.reduce((sum, v) => sum + v * v, 0) / buffer.length);
      const peak = Math.max(...buffer.map(Math.abs));
      BrowserWindow.getAllWindows()[0]?.webContents.send('audio:level', {
        streamId: filename,
        rms: Math.min(rms * 5, 1.0),  // normalize
        peak: Math.min(peak, 1.0),
        timestamp: Date.now() - this.startTime,
      });
    });

    return this.outputPath;
  }

  async stopRecording(): Promise<{ path: string; duration: number; size: number }> {
    if (!this.audio || !this.outputPath) throw new Error('Not recording');
    await this.audio.stop();  // finalizes WAV file
    const duration = (Date.now() - this.startTime) / 1000;
    const stats = fs.statSync(this.outputPath);
    const result = { path: this.outputPath, duration, size: stats.size };
    this.audio = null;
    this.outputPath = null;
    return result;
  }
}
```

### 6. IPC Handlers
```typescript
// src/main/ipc/audio.ts
import { ipcMain, systemPreferences } from 'electron';
import { AudioCaptureService } from '../services/AudioCaptureService';
import { DatabaseService } from '../services/DatabaseService';

export function registerAudioHandlers(audio: AudioCaptureService, db: DatabaseService, recordingsDir: string) {
  ipcMain.handle('audio:start-recording', async () => {
    const audioPath = await audio.startRecording(recordingsDir);
    return { audioPath };
  });

  ipcMain.handle('audio:stop-recording', async () => {
    const result = await audio.stopRecording();
    const id = db.insertRecording({
      title: `Recording ${new Date().toLocaleString()}`,
      audioPath: result.path,
      duration: result.duration,
      fileSizeBytes: result.size,
    });
    return { id, ...result };
  });

  ipcMain.handle('audio:request-permission', async () => {
    if (process.platform === 'darwin') {
      return systemPreferences.askForMediaAccess('microphone');
    }
    return true;
  });
}
```

### 7. React UI — Sidebar & Navigation
```tsx
// src/renderer/App.tsx
import { useState } from 'react';
import { RecordingView } from './components/Recording/RecordingView';
import { LibraryView } from './components/Library/LibraryView';
import { SettingsView } from './components/Settings/SettingsView';
import { RecordingProvider } from './contexts/RecordingContext';
import { cn } from './lib/utils';

type Page = 'library' | 'record' | 'settings';

export default function App() {
  const [page, setPage] = useState<Page>('library');

  return (
    <RecordingProvider>
      <div className="flex h-screen bg-background">
        {/* Sidebar */}
        <nav className="w-56 border-r border-border flex flex-col p-3 gap-1">
          <SidebarItem icon="📚" label="Library" active={page === 'library'} onClick={() => setPage('library')} />
          <SidebarItem icon="🎙️" label="Record" active={page === 'record'} onClick={() => setPage('record')} />
          <SidebarItem icon="⚙️" label="Settings" active={page === 'settings'} onClick={() => setPage('settings')} />
        </nav>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          {page === 'library' && <LibraryView />}
          {page === 'record' && <RecordingView />}
          {page === 'settings' && <SettingsView />}
        </main>
      </div>
    </RecordingProvider>
  );
}
```

### 8. Waveform Component
```tsx
// src/renderer/components/ui/Waveform.tsx
import { useRef, useEffect } from 'react';

interface WaveformProps {
  levels: number[];  // 0.0–1.0 rms values
  isRecording: boolean;
}

export function Waveform({ levels, isRecording }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    const barWidth = 3;
    const gap = 1;
    const maxBars = Math.floor(width / (barWidth + gap));
    const visible = levels.slice(-maxBars);

    visible.forEach((level, i) => {
      const barHeight = Math.max(2, level * height);
      const x = i * (barWidth + gap);
      const y = (height - barHeight) / 2;
      ctx.fillStyle = isRecording ? '#ef4444' : '#6b7280';
      ctx.fillRect(x, y, barWidth, barHeight);
    });
  }, [levels, isRecording]);

  return <canvas ref={canvasRef} width={600} height={80} className="w-full h-20 rounded-lg bg-muted" />;
}
```

### 9. Audio Playback Hook
```typescript
// src/renderer/hooks/useAudioPlayer.ts
import { useState, useRef, useCallback, useEffect } from 'react';

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);

  const load = useCallback((filePath: string) => {
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(`file://${filePath}`);
    audio.playbackRate = playbackRate;
    audio.addEventListener('loadedmetadata', () => setDuration(audio.duration));
    audio.addEventListener('timeupdate', () => setCurrentTime(audio.currentTime));
    audio.addEventListener('ended', () => setIsPlaying(false));
    audioRef.current = audio;
  }, [playbackRate]);

  const play = useCallback(() => { audioRef.current?.play(); setIsPlaying(true); }, []);
  const pause = useCallback(() => { audioRef.current?.pause(); setIsPlaying(false); }, []);
  const seek = useCallback((time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time;
  }, []);
  const setRate = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, []);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  return { load, play, pause, seek, setRate, isPlaying, currentTime, duration, playbackRate };
}
```

## New Files

```
src/
├── main/
│   ├── index.ts
│   ├── store.ts
│   ├── services/
│   │   ├── AudioCaptureService.ts
│   │   └── DatabaseService.ts
│   └── ipc/
│       ├── audio.ts
│       └── database.ts
├── preload/
│   └── index.ts
├── renderer/
│   ├── App.tsx
│   ├── index.html
│   ├── styles/
│   │   └── globals.css
│   ├── lib/
│   │   └── utils.ts
│   ├── contexts/
│   │   └── RecordingContext.tsx
│   ├── hooks/
│   │   ├── useRecording.ts
│   │   └── useAudioPlayer.ts
│   └── components/
│       ├── ui/
│       │   └── Waveform.tsx
│       ├── Recording/
│       │   └── RecordingView.tsx
│       ├── Library/
│       │   ├── LibraryView.tsx
│       │   ├── RecordingDetail.tsx
│       │   └── RecordingRow.tsx
│       └── Settings/
│           └── SettingsView.tsx
└── shared/
    ├── types.ts
    └── ipc-channels.ts
tests/
├── unit/
│   ├── DatabaseService.test.ts
│   └── AudioCaptureService.test.ts
└── e2e/
    └── app-launch.test.ts
```

## Database Schema

```sql
CREATE TABLE recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  duration REAL NOT NULL DEFAULT 0,
  audio_path TEXT NOT NULL,
  category TEXT,
  is_bookmarked INTEGER NOT NULL DEFAULT 0,
  file_size_bytes INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_recordings_created_at ON recordings(created_at);
CREATE INDEX idx_recordings_category ON recordings(category);
```

## UI Components

| Component | Description |
|-----------|-------------|
| `App` | Root layout — sidebar nav + content area |
| `RecordingView` | Big record button, elapsed timer, live waveform, stop |
| `Waveform` | Canvas-based real-time waveform from audio RMS levels |
| `LibraryView` | Recording list with search (`.searchable`), sort dropdown |
| `RecordingRow` | Row: title, date, duration badge, category tag |
| `RecordingDetail` | Playback controls, metadata, future: transcript/summary |
| `SettingsView` | Placeholder for preferences (audio input device, storage path) |

## Testing Strategy

### Unit Tests (Vitest)
- `DatabaseService`: CRUD operations with in-memory SQLite (`:memory:`)
- `AudioCaptureService`: Mock `native-audio-node`, verify lifecycle
- Shared types: Validate type guards

### E2E Tests (Playwright)
- App launches with correct window title
- Sidebar navigation works
- Record → stop → recording appears in library
- Playback controls work
- Delete recording removes from library

## Acceptance Criteria

- [ ] `pnpm dev` launches Electron app with sidebar and main content
- [ ] Sidebar navigation between Library, Record, Settings works
- [ ] Tapping Record starts microphone capture (permission dialog on macOS first use)
- [ ] Live waveform renders during recording
- [ ] Tapping Stop saves `.wav` file and inserts recording into SQLite
- [ ] Recording appears in Library view immediately after saving
- [ ] Search filters recordings by title
- [ ] Tapping a recording opens detail view with playback controls
- [ ] Play/pause/seek works correctly
- [ ] Playback speed can be changed (0.5x, 1x, 1.5x, 2x)
- [ ] Recording can be deleted from library (file + database row)
- [ ] Audio files saved to `app.getPath('userData')/recordings/`
- [ ] Tray icon with quick-record action (macOS/Windows)
- [ ] CSP configured in index.html
- [ ] All IPC uses `contextBridge` — no direct `ipcRenderer` in renderer
- [ ] TypeScript strict mode — zero `any` types
- [ ] Unit tests pass for DatabaseService and AudioCaptureService
- [ ] E2E test passes for app launch

## Edge Cases & Gotchas

- **macOS mic permission**: Must call `systemPreferences.askForMediaAccess('microphone')` before first capture — otherwise silent failure
- **Linux audio**: `native-audio-node` may need PulseAudio/PipeWire — document fallback
- **Windows**: No tray icon on Windows 11 by default — use notification area
- **Large recordings**: Stream WAV writing (don't buffer entire recording in memory)
- **Concurrent recordings**: Prevent starting a second recording while one is active
- **File cleanup**: If recording fails mid-capture, clean up partial WAV files
- **SQLite WAL on network drives**: WAL mode fails on SMB/NFS — detect and fall back to DELETE journal mode
