---
name: Plan 03 - Recording Library and Database
overview: better-sqlite3 기반 저장소, 녹음/전사 메타데이터 스키마, CRUD IPC, 라이브러리 탐색과 상세 재생 UX를 구축하기 위한 실행 플랜입니다.
todos:
  - id: db-service-migrations
    content: DatabaseService와 마이그레이션 체계를 구축하고 WAL 설정을 적용한다.
    status: completed
  - id: schema-and-indexes
    content: recordings/transcript 중심 스키마와 인덱스를 설계 및 반영한다.
    status: completed
  - id: library-ipc-crud
    content: 목록/상세/생성/수정/삭제 및 검색 IPC를 구현한다.
    status: completed
  - id: library-ui
    content: 라이브러리 리스트/필터/정렬/상세 UI를 구현한다.
    status: completed
  - id: database-tests
    content: DB 질의 정확성과 라이브러리 플로우를 테스트로 검증한다.
    status: completed
isProject: true
---

# Plan 03: Recording Library & Database

**Phase:** 1 — Core App
**Priority:** P0 (Foundation)
**Effort:** ~1.5 weeks
**Prerequisites:** Plan 01 (audio recording), Plan 02 (transcription)

## Overview

Build the complete recording persistence layer with `better-sqlite3`. Design schema for recordings, audio files, and transcript segments. Implement CRUD operations via IPC. Create Library UI with list/grid views, search, filtering, sorting, and a detailed recording view with audio playback synchronized to transcript segments.

## Architecture

### Database Layer

- `src/main/services/DatabaseService.ts` — SQLite connection, migrations, queries
- Database file: `app.getPath('userData')/voicevault.db`
- WAL mode enabled for concurrent reads
- Automatic backup on schema migration

### IPC Bridge

- `db:recordings:list` — get all recordings with filters/sort
- `db:recordings:get` — get single recording with full details
- `db:recordings:create` — insert new recording
- `db:recordings:update` — update metadata
- `db:recordings:delete` — soft delete recording
- `db:search` — full-text search across transcripts

### React Layer

- `src/renderer/contexts/LibraryContext.tsx` — recordings state management
- `src/renderer/components/Library/LibraryView.tsx` — main library view
- `src/renderer/components/Library/RecordingCard.tsx` — grid/list item
- `src/renderer/components/Library/RecordingDetail.tsx` — detail view with playback

## Implementation Steps

### 1. Database Service (Main Process)

1. Install `better-sqlite3` (`pnpm add better-sqlite3 && pnpm add -D @types/better-sqlite3`)
2. Create `DatabaseService` class managing SQLite connection
3. Implement migration system (versioned SQL files in `src/main/migrations/`)
4. Enable WAL mode for performance
5. Implement prepared statements for all queries
6. Add transaction support for batch operations

```typescript
// src/main/services/DatabaseService.ts
import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export interface Recording {
  id: number;
  title: string;
  duration: number;
  audioPath: string;
  createdAt: string;
  updatedAt: string;
  category?: string;
  tags?: string[];
  isBookmarked: boolean;
  isArchived: boolean;
}

export interface RecordingWithTranscript extends Recording {
  segments: TranscriptSegment[];
}

export class DatabaseService {
  private db: Database.Database;

  constructor() {
    const dbPath = path.join(app.getPath('userData'), 'voicevault.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initialize();
  }

  private initialize(): void {
    this.runMigrations();
  }

  private runMigrations(): void {
    const currentVersion = this.db.pragma('user_version', { simple: true }) as number;
    const migrations = this.loadMigrations();

    migrations.slice(currentVersion).forEach((sql, idx) => {
      this.db.exec(sql);
      this.db.pragma(`user_version = ${currentVersion + idx + 1}`);
    });
  }

  private loadMigrations(): string[] {
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    return fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort()
      .map(f => fs.readFileSync(path.join(migrationsDir, f), 'utf-8'));
  }

  // CRUD Operations

  createRecording(title: string, duration: number, audioPath: string): Recording {
    const stmt = this.db.prepare(`
      INSERT INTO recordings (title, duration, audio_path, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `);

    const result = stmt.run(title, duration, audioPath);
    return this.getRecording(result.lastInsertRowid as number)!;
  }

  getRecording(id: number): Recording | null {
    const stmt = this.db.prepare(`
      SELECT id, title, duration, audio_path as audioPath,
             created_at as createdAt, updated_at as updatedAt,
             category, tags, is_bookmarked as isBookmarked,
             is_archived as isArchived
      FROM recordings
      WHERE id = ? AND is_archived = 0
    `);

    const row = stmt.get(id) as any;
    if (!row) return null;

    return {
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : [],
      isBookmarked: Boolean(row.isBookmarked),
      isArchived: Boolean(row.isArchived),
    };
  }

  getRecordingWithTranscript(id: number): RecordingWithTranscript | null {
    const recording = this.getRecording(id);
    if (!recording) return null;

    const segments = this.db.prepare(`
      SELECT text, start_time as start, end_time as end,
             language, confidence
      FROM transcript_segments
      WHERE recording_id = ?
      ORDER BY start_time ASC
    `).all(id) as TranscriptSegment[];

    return { ...recording, segments };
  }

  listRecordings(options: {
    search?: string;
    category?: string;
    sortBy?: 'createdAt' | 'duration' | 'title';
    sortOrder?: 'ASC' | 'DESC';
    limit?: number;
    offset?: number;
  }): Recording[] {
    const { search, category, sortBy = 'createdAt', sortOrder = 'DESC', limit = 50, offset = 0 } = options;

    let query = `SELECT * FROM recordings WHERE is_archived = 0`;
    const params: any[] = [];

    if (search) {
      query += ` AND id IN (
        SELECT recording_id FROM transcript_segments_fts
        WHERE transcript_segments_fts MATCH ?
      )`;
      params.push(search);
    }

    if (category) {
      query += ` AND category = ?`;
      params.push(category);
    }

    query += ` ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    return this.db.prepare(query).all(...params) as Recording[];
  }

  updateRecording(id: number, updates: Partial<Recording>): void {
    const fields = Object.keys(updates)
      .filter(k => k !== 'id')
      .map(k => `${this.toSnakeCase(k)} = ?`)
      .join(', ');

    const values = Object.values(updates).filter((_, i) => Object.keys(updates)[i] !== 'id');

    this.db.prepare(`UPDATE recordings SET ${fields}, updated_at = datetime('now') WHERE id = ?`)
      .run(...values, id);
  }

  deleteRecording(id: number, hard = false): void {
    if (hard) {
      this.db.prepare('DELETE FROM recordings WHERE id = ?').run(id);
    } else {
      this.db.prepare('UPDATE recordings SET is_archived = 1 WHERE id = ?').run(id);
    }
  }

  searchRecordings(query: string): Recording[] {
    return this.listRecordings({ search: query });
  }

  private toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  close(): void {
    this.db.close();
  }
}
```

### 2. Database Migrations

1. Create `src/main/migrations/` directory
2. Write migration files in order: `001_init.sql`, `002_transcripts.sql`, `003_fts.sql`

```sql
-- src/main/migrations/001_init.sql
CREATE TABLE IF NOT EXISTS recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  duration REAL NOT NULL,           -- seconds
  audio_path TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  category TEXT,
  tags TEXT,                        -- JSON array
  is_bookmarked INTEGER DEFAULT 0,
  is_archived INTEGER DEFAULT 0
);

CREATE INDEX idx_recordings_created ON recordings(created_at DESC);
CREATE INDEX idx_recordings_category ON recordings(category);
CREATE INDEX idx_recordings_archived ON recordings(is_archived);

-- src/main/migrations/002_transcripts.sql
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

-- src/main/migrations/003_fts.sql
CREATE VIRTUAL TABLE IF NOT EXISTS transcript_segments_fts USING fts5(
  recording_id UNINDEXED,
  text,
  content=transcript_segments,
  content_rowid=id
);

-- Triggers to keep FTS index in sync
CREATE TRIGGER IF NOT EXISTS transcript_ai AFTER INSERT ON transcript_segments BEGIN
  INSERT INTO transcript_segments_fts(rowid, recording_id, text)
  VALUES (new.id, new.recording_id, new.text);
END;

CREATE TRIGGER IF NOT EXISTS transcript_ad AFTER DELETE ON transcript_segments BEGIN
  DELETE FROM transcript_segments_fts WHERE rowid = old.id;
END;

CREATE TRIGGER IF NOT EXISTS transcript_au AFTER UPDATE ON transcript_segments BEGIN
  UPDATE transcript_segments_fts SET text = new.text WHERE rowid = old.id;
END;
```

### 3. IPC Handlers (Main Process)

1. Create `src/main/ipc/database.ts`
2. Register handlers in `src/main/index.ts`

```typescript
// src/main/ipc/database.ts
import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { DatabaseService } from '../services/DatabaseService';

let db: DatabaseService;

export function registerDatabaseHandlers(): void {
  db = new DatabaseService();

  ipcMain.handle('db:recordings:list', async (_, options) => {
    return db.listRecordings(options);
  });

  ipcMain.handle('db:recordings:get', async (_, id: number) => {
    return db.getRecordingWithTranscript(id);
  });

  ipcMain.handle('db:recordings:create', async (_, title: string, duration: number, audioPath: string) => {
    return db.createRecording(title, duration, audioPath);
  });

  ipcMain.handle('db:recordings:update', async (_, id: number, updates: any) => {
    db.updateRecording(id, updates);
    return { success: true };
  });

  ipcMain.handle('db:recordings:delete', async (_, id: number, hard = false) => {
    db.deleteRecording(id, hard);
    return { success: true };
  });

  ipcMain.handle('db:search', async (_, query: string) => {
    return db.searchRecordings(query);
  });

  app.on('quit', () => db.close());
}
```

### 4. Preload API (Preload Process)

1. Extend `contextBridge` with database methods

```typescript
// src/preload/index.ts (extend)
contextBridge.exposeInMainWorld('api', {
  // ... existing APIs

  database: {
    listRecordings: (options: any) => ipcRenderer.invoke('db:recordings:list', options),
    getRecording: (id: number) => ipcRenderer.invoke('db:recordings:get', id),
    createRecording: (title: string, duration: number, audioPath: string) =>
      ipcRenderer.invoke('db:recordings:create', title, duration, audioPath),
    updateRecording: (id: number, updates: any) =>
      ipcRenderer.invoke('db:recordings:update', id, updates),
    deleteRecording: (id: number, hard?: boolean) =>
      ipcRenderer.invoke('db:recordings:delete', id, hard),
    search: (query: string) => ipcRenderer.invoke('db:search', query),
  },
});
```

### 5. Library Context (Renderer)

1. Create `src/renderer/contexts/LibraryContext.tsx`
2. Manage recordings state, search, filters, selection

```typescript
// src/renderer/contexts/LibraryContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Recording } from '@shared/types';

interface LibraryContextValue {
  recordings: Recording[];
  selectedRecording: Recording | null;
  searchQuery: string;
  sortBy: 'createdAt' | 'duration' | 'title';
  viewMode: 'list' | 'grid';
  setSearchQuery: (query: string) => void;
  setSortBy: (sort: 'createdAt' | 'duration' | 'title') => void;
  setViewMode: (mode: 'list' | 'grid') => void;
  selectRecording: (id: number) => void;
  refreshRecordings: () => Promise<void>;
  deleteRecording: (id: number) => Promise<void>;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'createdAt' | 'duration' | 'title'>('createdAt');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const refreshRecordings = async () => {
    const results = await window.api.database.listRecordings({
      search: searchQuery || undefined,
      sortBy,
      sortOrder: 'DESC',
    });
    setRecordings(results);
  };

  useEffect(() => {
    refreshRecordings();
  }, [searchQuery, sortBy]);

  const selectRecording = async (id: number) => {
    const recording = await window.api.database.getRecording(id);
    setSelectedRecording(recording);
  };

  const deleteRecording = async (id: number) => {
    await window.api.database.deleteRecording(id);
    await refreshRecordings();
    if (selectedRecording?.id === id) {
      setSelectedRecording(null);
    }
  };

  return (
    <LibraryContext.Provider value={{
      recordings,
      selectedRecording,
      searchQuery,
      sortBy,
      viewMode,
      setSearchQuery,
      setSortBy,
      setViewMode,
      selectRecording,
      refreshRecordings,
      deleteRecording,
    }}>
      {children}
    </LibraryContext.Provider>
  );
}

export const useLibrary = () => {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary must be used within LibraryProvider');
  return ctx;
};
```

### 6. Library UI Components (Renderer)

1. `LibraryView.tsx` — main view with toolbar, search, view mode toggle
2. `RecordingCard.tsx` — grid/list item with thumbnail, duration, date
3. `RecordingDetail.tsx` — detail panel with playback and transcript
4. Integrate with shadcn/ui components

```typescript
// src/renderer/components/Library/LibraryView.tsx
import { Search, LayoutGrid, LayoutList, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLibrary } from '@/contexts/LibraryContext';
import { RecordingCard } from './RecordingCard';
import { RecordingDetail } from './RecordingDetail';

export function LibraryView() {
  const { recordings, searchQuery, setSearchQuery, sortBy, setSortBy, viewMode, setViewMode, selectedRecording } = useLibrary();

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-4 p-4 border-b">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search recordings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="createdAt">Date Created</SelectItem>
              <SelectItem value="duration">Duration</SelectItem>
              <SelectItem value="title">Title</SelectItem>
            </SelectContent>
          </Select>

          <ToggleGroup type="single" value={viewMode} onValueChange={(v: any) => v && setViewMode(v)}>
            <ToggleGroupItem value="list">
              <LayoutList className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="grid">
              <LayoutGrid className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Recordings Grid/List */}
        <div className={`flex-1 overflow-auto p-4 ${viewMode === 'grid' ? 'grid grid-cols-3 gap-4' : 'space-y-2'}`}>
          {recordings.map(recording => (
            <RecordingCard key={recording.id} recording={recording} />
          ))}

          {recordings.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery ? 'No recordings found' : 'No recordings yet. Start recording!'}
            </div>
          )}
        </div>
      </div>

      {/* Detail Panel */}
      {selectedRecording && (
        <div className="w-96 border-l">
          <RecordingDetail recording={selectedRecording} />
        </div>
      )}
    </div>
  );
}
```

## New Files

```
src/
├── main/
│   ├── services/
│   │   └── DatabaseService.ts
│   ├── ipc/
│   │   └── database.ts
│   └── migrations/
│       ├── 001_init.sql
│       ├── 002_transcripts.sql
│       └── 003_fts.sql
└── renderer/
    ├── contexts/
    │   └── LibraryContext.tsx
    └── components/
        └── Library/
            ├── LibraryView.tsx
            ├── RecordingCard.tsx
            ├── RecordingDetail.tsx
            └── RecordingToolbar.tsx
```

## UI Components (shadcn/ui)


| Component       | Base                | Purpose                     |
| --------------- | ------------------- | --------------------------- |
| LibraryView     | Container           | Main library layout         |
| RecordingCard   | Card                | Recording item in grid/list |
| RecordingDetail | Sheet/Panel         | Detail view with playback   |
| Search bar      | Input + Search icon | Full-text search            |
| Sort selector   | Select              | Change sort order           |
| View toggle     | ToggleGroup         | Switch list/grid            |


## Testing Strategy

### Unit Tests

- `DatabaseService.test.ts` — CRUD operations, migrations, FTS search
- `LibraryContext.test.ts` — state management, filtering

### E2E Tests

- Create 3 recordings → verify appear in library
- Search for keyword → verify filtered results
- Delete recording → verify removed from list
- Sort by duration → verify correct order

## Acceptance Criteria

- Database initializes on first launch with all migrations
- Recordings persist across app restarts
- Library view shows all recordings sorted by date (newest first)
- Search filters recordings by transcript content (FTS5)
- Sort by date/duration/title works correctly
- List and grid view modes toggle
- Clicking recording opens detail panel
- Detail panel shows full transcript with playback controls
- Clicking transcript segment seeks to that timestamp
- Delete recording removes from UI and database (soft delete)
- Bookmark toggle persists
- Tags can be added/removed
- Category can be changed via dropdown
- Empty state shows helpful message
- Search shows "no results" state

## Edge Cases & Gotchas

- **Migration failures:** Back up DB before migration, rollback on error
- **Large libraries:** Virtualize list for 1000+ recordings (use `react-window`)
- **FTS index:** Rebuild if out of sync (`INSERT INTO transcript_segments_fts(transcript_segments_fts) VALUES('rebuild')`)
- **File paths:** Store relative to userData, not absolute
- **Concurrent writes:** Use transactions for multi-statement operations
- **Search syntax:** FTS5 supports advanced queries (AND, OR, NOT) — document in UI
- **Deleted audio files:** Handle missing files gracefully (show warning, disable playback)

## Performance Targets


| Metric                    | Target                                     |
| ------------------------- | ------------------------------------------ |
| **Library load time**     | <200ms for 100 recordings                  |
| **Search latency**        | <50ms for FTS query                        |
| **Migration time**        | <1s for all migrations (first launch)      |
| **UI scroll performance** | 60 FPS with 1000+ recordings (virtualized) |


