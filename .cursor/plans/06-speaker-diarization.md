# Plan 06: Speaker Diarization

**Phase:** 3 — Speaker Diarization  
**Priority:** P1 (High Value)  
**Effort:** ~2 weeks  
**Prerequisites:** Plan 02 (transcription), Plan 03 (database)

## Overview

Integrate `pyannote-cpp-node` for speaker diarization — identify "who said what" in multi-speaker recordings. Run segmentation, extract speaker embeddings, cluster speakers, and align speaker labels with transcript segments. Build UI for speaker-colored transcripts, speaker timeline visualization, occupancy stats, and speaker profile management (name/tag speakers across recordings).

## Architecture

### Native Layer
- `src/main/services/DiarizationService.ts` — wraps `pyannote-cpp-node`
- `src/main/services/SpeakerProfileService.ts` — manage speaker profiles and embeddings
- Speaker embeddings stored in database for cross-recording identification

### IPC Bridge
- `diarization:process` — run diarization on audio file
- `diarization:on-segment` — event channel for speaker segments
- `diarization:align-transcript` — merge speaker labels with transcript segments
- `speakers:list` — get all known speaker profiles
- `speakers:create` — create/name a speaker
- `speakers:merge` — merge two speaker profiles
- `speakers:update` — update speaker name/metadata

### React Layer
- `src/renderer/components/Transcript/SpeakerTranscriptView.tsx` — color-coded transcript by speaker
- `src/renderer/components/Diarization/SpeakerTimeline.tsx` — visual timeline of speaker turns
- `src/renderer/components/Diarization/SpeakerStats.tsx` — occupancy percentages, talk time
- `src/renderer/components/Settings/SpeakerProfiles.tsx` — manage speaker library

## Implementation Steps

### 1. Diarization Service (Main Process)
1. Install `pyannote-cpp-node` (`pnpm add pyannote-cpp-node`)
2. Create `DiarizationService` wrapping pyannote-ggml pipeline
3. Implement 3-stage pipeline: segmentation → embedding → clustering
4. Output speaker segments: `{ start, end, speaker_id, confidence }`

```typescript
// src/main/services/DiarizationService.ts
import { Pyannote } from 'pyannote-cpp-node';
import { app } from 'electron';
import path from 'path';

export interface SpeakerSegment {
  start: number;
  end: number;
  speaker: string; // 'SPEAKER_00', 'SPEAKER_01', etc.
  confidence: number;
}

export interface SpeakerStats {
  speaker: string;
  totalDuration: number;
  percentage: number;
  turnCount: number;
}

export class DiarizationService {
  private pyannote: Pyannote | null = null;
  private modelPath: string;
  
  constructor() {
    this.modelPath = path.join(app.getPath('userData'), 'models', 'pyannote');
  }
  
  async initialize(): Promise<void> {
    if (!await this.isModelAvailable()) {
      throw new Error('Pyannote model not found. Download required.');
    }
    
    this.pyannote = new Pyannote({
      modelPath: this.modelPath,
      numThreads: 4,
    });
  }
  
  async diarize(audioPath: string, numSpeakers?: number): Promise<SpeakerSegment[]> {
    if (!this.pyannote) await this.initialize();
    
    const result = await this.pyannote!.diarize(audioPath, {
      minSpeakers: numSpeakers || 1,
      maxSpeakers: numSpeakers || 10,
    });
    
    return result.segments.map(seg => ({
      start: seg.start,
      end: seg.end,
      speaker: seg.speaker,
      confidence: seg.confidence || 1.0,
    }));
  }
  
  async extractEmbedding(audioPath: string, start: number, end: number): Promise<Float32Array> {
    if (!this.pyannote) await this.initialize();
    
    const embedding = await this.pyannote!.embed(audioPath, { start, end });
    return embedding;
  }
  
  calculateStats(segments: SpeakerSegment[], totalDuration: number): SpeakerStats[] {
    const speakerMap = new Map<string, { duration: number; turns: number }>();
    
    segments.forEach(seg => {
      const duration = seg.end - seg.start;
      const current = speakerMap.get(seg.speaker) || { duration: 0, turns: 0 };
      speakerMap.set(seg.speaker, {
        duration: current.duration + duration,
        turns: current.turns + 1,
      });
    });
    
    return Array.from(speakerMap.entries()).map(([speaker, data]) => ({
      speaker,
      totalDuration: data.duration,
      percentage: (data.duration / totalDuration) * 100,
      turnCount: data.turns,
    }));
  }
  
  async isModelAvailable(): Promise<boolean> {
    const fs = await import('fs/promises');
    try {
      await fs.access(path.join(this.modelPath, 'segmentation.onnx'));
      await fs.access(path.join(this.modelPath, 'embedding.onnx'));
      return true;
    } catch {
      return false;
    }
  }
  
  destroy(): void {
    this.pyannote?.destroy();
    this.pyannote = null;
  }
}
```

### 2. Speaker Profile Service (Main Process)
1. Manage speaker embeddings and metadata
2. Implement cross-recording speaker identification via embedding similarity
3. Support speaker merging (combine profiles)

```typescript
// src/main/services/SpeakerProfileService.ts
import type { Database } from 'better-sqlite3';

export interface SpeakerProfile {
  id: number;
  name: string;
  color: string;
  embedding?: Float32Array;
  recordingCount: number;
  totalDuration: number;
  createdAt: string;
}

export class SpeakerProfileService {
  constructor(private db: Database) {}
  
  createProfile(name: string, embedding?: Float32Array): SpeakerProfile {
    const color = this.generateColor();
    
    const stmt = this.db.prepare(`
      INSERT INTO speaker_profiles (name, color, embedding, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `);
    
    const result = stmt.run(name, color, embedding ? this.serializeEmbedding(embedding) : null);
    
    return this.getProfile(result.lastInsertRowid as number)!;
  }
  
  getProfile(id: number): SpeakerProfile | null {
    const row = this.db.prepare(`
      SELECT id, name, color, embedding, created_at as createdAt,
             (SELECT COUNT(DISTINCT recording_id) FROM speaker_segments WHERE speaker_profile_id = ?) as recordingCount,
             (SELECT SUM(end_time - start_time) FROM speaker_segments WHERE speaker_profile_id = ?) as totalDuration
      FROM speaker_profiles
      WHERE id = ?
    `).get(id, id, id) as any;
    
    if (!row) return null;
    
    return {
      ...row,
      embedding: row.embedding ? this.deserializeEmbedding(row.embedding) : undefined,
      recordingCount: row.recordingCount || 0,
      totalDuration: row.totalDuration || 0,
    };
  }
  
  listProfiles(): SpeakerProfile[] {
    const rows = this.db.prepare(`
      SELECT sp.id, sp.name, sp.color, sp.created_at as createdAt,
             COUNT(DISTINCT ss.recording_id) as recordingCount,
             SUM(ss.end_time - ss.start_time) as totalDuration
      FROM speaker_profiles sp
      LEFT JOIN speaker_segments ss ON ss.speaker_profile_id = sp.id
      GROUP BY sp.id
      ORDER BY sp.created_at DESC
    `).all() as any[];
    
    return rows.map(row => ({
      ...row,
      recordingCount: row.recordingCount || 0,
      totalDuration: row.totalDuration || 0,
    }));
  }
  
  updateProfile(id: number, updates: { name?: string; color?: string }): void {
    const fields = [];
    const values = [];
    
    if (updates.name) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.color) {
      fields.push('color = ?');
      values.push(updates.color);
    }
    
    if (fields.length === 0) return;
    
    values.push(id);
    
    this.db.prepare(`UPDATE speaker_profiles SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
  
  mergeProfiles(sourceId: number, targetId: number): void {
    // Reassign all segments from source to target
    this.db.prepare(`
      UPDATE speaker_segments SET speaker_profile_id = ? WHERE speaker_profile_id = ?
    `).run(targetId, sourceId);
    
    // Delete source profile
    this.db.prepare('DELETE FROM speaker_profiles WHERE id = ?').run(sourceId);
  }
  
  findSimilarSpeaker(embedding: Float32Array, threshold = 0.75): SpeakerProfile | null {
    // Get all profiles with embeddings
    const profiles = this.db.prepare('SELECT id, embedding FROM speaker_profiles WHERE embedding IS NOT NULL').all() as any[];
    
    let bestMatch: { id: number; similarity: number } | null = null;
    
    profiles.forEach(profile => {
      const profileEmbedding = this.deserializeEmbedding(profile.embedding);
      const similarity = this.cosineSimilarity(embedding, profileEmbedding);
      
      if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
        bestMatch = { id: profile.id, similarity };
      }
    });
    
    return bestMatch ? this.getProfile(bestMatch.id) : null;
  }
  
  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
  
  private serializeEmbedding(embedding: Float32Array): Buffer {
    return Buffer.from(embedding.buffer);
  }
  
  private deserializeEmbedding(buffer: Buffer): Float32Array {
    return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  }
  
  private generateColor(): string {
    const colors = [
      '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
      '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}
```

### 3. Transcript Alignment
1. Merge speaker segments with transcript segments by timestamp
2. Handle overlapping speech (assign to primary speaker)

```typescript
// Add to DiarizationService
alignTranscript(
  transcriptSegments: TranscriptSegment[],
  speakerSegments: SpeakerSegment[]
): Array<TranscriptSegment & { speaker: string }> {
  return transcriptSegments.map(seg => {
    // Find speaker segment that overlaps most with this transcript segment
    let bestMatch: SpeakerSegment | null = null;
    let maxOverlap = 0;
    
    speakerSegments.forEach(spk => {
      const overlap = Math.min(seg.end, spk.end) - Math.max(seg.start, spk.start);
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestMatch = spk;
      }
    });
    
    return {
      ...seg,
      speaker: bestMatch?.speaker || 'SPEAKER_UNKNOWN',
    };
  });
}
```

### 4. Database Schema Extension
```sql
-- Migration: 005_diarization.sql
CREATE TABLE IF NOT EXISTS speaker_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  embedding BLOB,                  -- serialized Float32Array
  created_at DATETIME NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS speaker_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recording_id INTEGER NOT NULL,
  speaker_profile_id INTEGER,      -- NULL if not yet identified
  start_time REAL NOT NULL,
  end_time REAL NOT NULL,
  confidence REAL,
  raw_speaker_label TEXT,          -- 'SPEAKER_00', 'SPEAKER_01'
  FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE,
  FOREIGN KEY (speaker_profile_id) REFERENCES speaker_profiles(id) ON DELETE SET NULL
);

CREATE INDEX idx_speaker_segments_recording ON speaker_segments(recording_id);
CREATE INDEX idx_speaker_segments_profile ON speaker_segments(speaker_profile_id);

-- Link transcript segments to speakers
ALTER TABLE transcript_segments ADD COLUMN speaker_profile_id INTEGER REFERENCES speaker_profiles(id);
```

### 5. IPC Handlers (Main Process)
```typescript
// src/main/ipc/diarization.ts
import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron';
import { DiarizationService } from '../services/DiarizationService';
import { SpeakerProfileService } from '../services/SpeakerProfileService';
import { db } from '../services/DatabaseService';

let diarizationService: DiarizationService | null = null;

export function registerDiarizationHandlers(mainWindow: BrowserWindow): void {
  const speakerProfileService = new SpeakerProfileService(db);
  
  ipcMain.handle('diarization:process', async (event, audioPath: string, recordingId: number) => {
    if (!diarizationService) {
      diarizationService = new DiarizationService();
      await diarizationService.initialize();
    }
    
    const segments = await diarizationService.diarize(audioPath);
    
    // Save segments to database
    segments.forEach(seg => {
      db.prepare(`
        INSERT INTO speaker_segments (recording_id, start_time, end_time, confidence, raw_speaker_label)
        VALUES (?, ?, ?, ?, ?)
      `).run(recordingId, seg.start, seg.end, seg.confidence, seg.speaker);
    });
    
    // Stream segments to UI
    segments.forEach(seg => {
      mainWindow.webContents.send('diarization:on-segment', seg);
    });
    
    return { success: true, segmentCount: segments.length };
  });
  
  ipcMain.handle('speakers:list', async () => {
    return speakerProfileService.listProfiles();
  });
  
  ipcMain.handle('speakers:create', async (_, name: string) => {
    return speakerProfileService.createProfile(name);
  });
  
  ipcMain.handle('speakers:update', async (_, id: number, updates: any) => {
    speakerProfileService.updateProfile(id, updates);
    return { success: true };
  });
  
  ipcMain.handle('speakers:merge', async (_, sourceId: number, targetId: number) => {
    speakerProfileService.mergeProfiles(sourceId, targetId);
    return { success: true };
  });
}
```

### 6. UI Components (Renderer)
```typescript
// src/renderer/components/Transcript/SpeakerTranscriptView.tsx
import { useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Props {
  segments: Array<TranscriptSegment & { speaker: string; speakerName?: string; speakerColor?: string }>;
}

export function SpeakerTranscriptView({ segments }: Props) {
  const groupedSegments = useMemo(() => {
    // Group consecutive segments by same speaker
    const groups: Array<{ speaker: string; speakerName?: string; speakerColor?: string; segments: typeof segments }> = [];
    
    segments.forEach(seg => {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.speaker === seg.speaker) {
        lastGroup.segments.push(seg);
      } else {
        groups.push({
          speaker: seg.speaker,
          speakerName: seg.speakerName,
          speakerColor: seg.speakerColor,
          segments: [seg],
        });
      }
    });
    
    return groups;
  }, [segments]);
  
  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        {groupedSegments.map((group, idx) => (
          <div key={idx} className="flex gap-3">
            <div
              className="w-1 rounded-full shrink-0"
              style={{ backgroundColor: group.speakerColor || '#6b7280' }}
            />
            <div className="flex-1 space-y-1">
              <Badge
                variant="outline"
                style={{ borderColor: group.speakerColor, color: group.speakerColor }}
              >
                {group.speakerName || group.speaker}
              </Badge>
              <div className="text-sm space-y-1">
                {group.segments.map((seg, segIdx) => (
                  <p key={segIdx} className="leading-relaxed">
                    {seg.text}
                  </p>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
```

```typescript
// src/renderer/components/Diarization/SpeakerTimeline.tsx
import { useMemo } from 'react';

interface Props {
  segments: SpeakerSegment[];
  duration: number;
}

export function SpeakerTimeline({ segments, duration }: Props) {
  return (
    <div className="space-y-2 p-4">
      <h3 className="text-sm font-semibold">Speaker Timeline</h3>
      <div className="relative h-12 bg-muted rounded-md overflow-hidden">
        {segments.map((seg, idx) => {
          const left = (seg.start / duration) * 100;
          const width = ((seg.end - seg.start) / duration) * 100;
          
          return (
            <div
              key={idx}
              className="absolute h-full transition-opacity hover:opacity-80"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                backgroundColor: getSpeakerColor(seg.speaker),
              }}
              title={`${seg.speaker}: ${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s`}
            />
          );
        })}
      </div>
    </div>
  );
}

function getSpeakerColor(speaker: string): string {
  const colors = {
    'SPEAKER_00': '#3b82f6',
    'SPEAKER_01': '#ef4444',
    'SPEAKER_02': '#10b981',
    'SPEAKER_03': '#f59e0b',
  };
  return colors[speaker] || '#6b7280';
}
```

## New Files

```
src/
├── main/
│   ├── services/
│   │   ├── DiarizationService.ts
│   │   └── SpeakerProfileService.ts
│   ├── ipc/
│   │   └── diarization.ts
│   └── migrations/
│       └── 005_diarization.sql
└── renderer/
    └── components/
        ├── Transcript/
        │   └── SpeakerTranscriptView.tsx
        └── Diarization/
            ├── SpeakerTimeline.tsx
            ├── SpeakerStats.tsx
            └── SpeakerProfileManager.tsx
```

## Testing Strategy

### Unit Tests
- `DiarizationService.test.ts` — mock pyannote, test segment alignment
- `SpeakerProfileService.test.ts` — test embedding similarity matching

### E2E Tests
- Diarize 2-speaker recording → verify 2 speaker segments
- Assign speaker name → verify name appears in transcript
- Merge 2 speaker profiles → verify segments reassigned

## Acceptance Criteria

- [ ] Diarization runs on recording stop (background process)
- [ ] Speaker segments align with transcript segments
- [ ] Transcript view color-coded by speaker
- [ ] Speaker timeline visualization shows speaker turns
- [ ] Speaker stats show talk time percentages
- [ ] Speaker profiles can be created and named
- [ ] Speaker names persist across recordings
- [ ] Embedding-based speaker identification works (>75% accuracy)
- [ ] Speaker merge combines profiles correctly
- [ ] Speaker colors assigned automatically
- [ ] Clicking speaker in timeline seeks to that segment

## Edge Cases & Gotchas

- **Overlapping speech:** Assign to speaker with higher confidence
- **Unknown speakers:** Label as "Speaker 1", "Speaker 2" until named
- **Single speaker:** Still run diarization, label all segments to one speaker
- **Background noise:** May create false speaker segments — filter by confidence >0.6
- **Cross-recording identification:** Embedding similarity can fail with different audio quality/mic

## Performance Targets

| Metric | Target |
|--------|--------|
| **Diarization speed** | 39x faster than real-time (pyannote-ggml) |
| **Embedding extraction** | <1s per speaker segment |
| **Transcript alignment** | <100ms for 1-hour recording |
