---
name: Plan 08 - Obsidian Export
overview: 녹음 데이터를 Obsidian 친화적 Markdown으로 내보내기 위해 템플릿 엔진, 프리뷰, 단일/배치 export, vault 경로 연동을 구현하는 실행 플랜입니다.
todos:
  - id: template-engine
    content: 템플릿 파싱과 변수 치환 기반 Markdown 생성 엔진을 구현한다.
    status: pending
  - id: export-service
    content: 단일/배치 Obsidian export 및 파일 쓰기 경로를 구현한다.
    status: pending
  - id: frontmatter-wikilinks
    content: YAML frontmatter와 관련 녹음 wikilinks 생성을 구현한다.
    status: pending
  - id: export-ui-preview
    content: 템플릿 선택과 Markdown 프리뷰를 포함한 Export UI를 구현한다.
    status: pending
  - id: export-validation
    content: vault 경로 및 파일명 충돌/권한 edge case를 검증한다.
    status: pending
isProject: true
---

# Plan 08: Obsidian Export

**Phase:** 5 — Export & Classification
**Priority:** P2 (Nice-to-Have)
**Effort:** ~1.5 weeks
**Prerequisites:** Plan 03 (database), Plan 04 (summaries), Plan 06 (diarization)

## Overview

Generate Obsidian-ready Markdown files from recordings with YAML frontmatter, wikilinks to related recordings, configurable templates, and automatic folder structure mapping. Support batch export, vault integration (choose vault path), and attachment handling (embed audio files as links). Build export UI with preview, template selection, and customization options.

## Architecture

### Main Process
- `src/main/services/ExportService.ts` — Markdown generation and file writing
- `src/main/services/TemplateEngine.ts` — template parsing and variable substitution
- Export templates stored in `resources/templates/obsidian/`

### IPC Bridge
- `export:obsidian` — export single recording
- `export:batch` — export multiple recordings
- `export:preview` — generate preview without writing
- `export:set-vault-path` — configure Obsidian vault location
- `export:get-templates` — list available templates

### React Layer
- `src/renderer/components/Export/ExportDialog.tsx` — export configuration dialog
- `src/renderer/components/Export/TemplateSelector.tsx` — choose template
- `src/renderer/components/Export/MarkdownPreview.tsx` — preview before export

## Implementation Steps

### 1. Template Engine (Main Process)
1. Create template system with Handlebars-like syntax
2. Support variables: `{{title}}`, `{{summary}}`, `{{actionItems}}`, etc.
3. Support conditionals and loops

```typescript
// src/main/services/TemplateEngine.ts
import Handlebars from 'handlebars';

export interface TemplateData {
  title: string;
  date: string;
  duration: number;
  summary?: string;
  actionItems?: Array<{ task: string; assignee?: string; deadline?: string }>;
  discussionPoints?: string[];
  decisions?: string[];
  transcript: Array<{ speaker?: string; text: string; timestamp: number }>;
  speakers?: Array<{ name: string; talkTime: number; percentage: number }>;
  tags?: string[];
  category?: string;
  relatedRecordings?: Array<{ title: string; link: string }>;
  audioPath?: string;
}

export class TemplateEngine {
  private templates: Map<string, HandlebarsTemplateDelegate> = new Map();

  constructor() {
    this.registerHelpers();
  }

  private registerHelpers(): void {
    // Format timestamp as MM:SS
    Handlebars.registerHelper('formatTime', (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    });

    // Format duration as human-readable
    Handlebars.registerHelper('formatDuration', (seconds: number) => {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);

      if (hours > 0) return `${hours}h ${mins}m`;
      if (mins > 0) return `${mins}m ${secs}s`;
      return `${secs}s`;
    });

    // Format date as YYYY-MM-DD
    Handlebars.registerHelper('formatDate', (date: string) => {
      return new Date(date).toISOString().split('T')[0];
    });

    // Create wikilink
    Handlebars.registerHelper('wikilink', (title: string) => {
      return `[[${title}]]`;
    });
  }

  loadTemplate(name: string, template: string): void {
    this.templates.set(name, Handlebars.compile(template));
  }

  render(templateName: string, data: TemplateData): string {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    return template(data);
  }
}
```

### 2. Export Service (Main Process)
1. Create `ExportService` handling file generation and writing
2. Generate YAML frontmatter with metadata
3. Create wikilinks to related recordings (by category/tags)
4. Handle audio file attachments

```typescript
// src/main/services/ExportService.ts
import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { TemplateEngine, TemplateData } from './TemplateEngine';
import type { RecordingWithTranscript } from './DatabaseService';

export interface ExportOptions {
  templateName: string;
  vaultPath: string;
  folderStructure: 'flat' | 'by-date' | 'by-category';
  includeAudio: boolean;
  audioAsAttachment: boolean; // embed vs link
  generateWikilinks: boolean;
}

export class ExportService {
  private templateEngine: TemplateEngine;

  constructor() {
    this.templateEngine = new TemplateEngine();
    this.loadBuiltInTemplates();
  }

  private async loadBuiltInTemplates(): Promise<void> {
    const templatesDir = path.join(app.getAppPath(), 'resources', 'templates', 'obsidian');

    try {
      const files = await fs.readdir(templatesDir);

      for (const file of files) {
        if (file.endsWith('.md')) {
          const content = await fs.readFile(path.join(templatesDir, file), 'utf-8');
          const name = path.basename(file, '.md');
          this.templateEngine.loadTemplate(name, content);
        }
      }
    } catch (error) {
      console.warn('No built-in templates found:', error);
    }
  }

  async exportRecording(
    recording: RecordingWithTranscript,
    options: ExportOptions
  ): Promise<{ path: string; content: string }> {
    // Build template data
    const data: TemplateData = {
      title: recording.title,
      date: recording.createdAt,
      duration: recording.duration,
      summary: recording.summary?.summary,
      actionItems: recording.summary?.actionItems,
      discussionPoints: recording.summary?.discussionPoints,
      decisions: recording.summary?.decisions,
      transcript: recording.segments.map(seg => ({
        speaker: seg.speakerName,
        text: seg.text,
        timestamp: seg.start,
      })),
      tags: recording.tags || [],
      category: recording.category,
      audioPath: options.includeAudio ? this.getAudioLink(recording.audioPath, options) : undefined,
    };

    // Generate wikilinks if enabled
    if (options.generateWikilinks) {
      data.relatedRecordings = await this.findRelatedRecordings(recording);
    }

    // Render template
    const content = this.templateEngine.render(options.templateName, data);

    // Add frontmatter
    const frontmatter = this.generateFrontmatter(recording, options);
    const fullContent = `${frontmatter}\n\n${content}`;

    // Determine output path
    const outputPath = this.getOutputPath(recording, options);

    // Ensure directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Write file
    await fs.writeFile(outputPath, fullContent, 'utf-8');

    // Copy audio file if embedding
    if (options.includeAudio && options.audioAsAttachment) {
      await this.copyAudioFile(recording.audioPath, outputPath, options);
    }

    return { path: outputPath, content: fullContent };
  }

  private generateFrontmatter(recording: RecordingWithTranscript, options: ExportOptions): string {
    const frontmatter: Record<string, any> = {
      title: recording.title,
      date: new Date(recording.createdAt).toISOString().split('T')[0],
      duration: Math.floor(recording.duration),
      category: recording.category || 'uncategorized',
      tags: recording.tags || [],
    };

    if (recording.summary) {
      frontmatter.has_summary = true;
    }

    if (recording.speakers && recording.speakers.length > 0) {
      frontmatter.speakers = recording.speakers.map(s => s.name);
    }

    const yaml = Object.entries(frontmatter)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return `${key}:\n${value.map(v => `  - ${v}`).join('\n')}`;
        }
        return `${key}: ${value}`;
      })
      .join('\n');

    return `---\n${yaml}\n---`;
  }

  private getOutputPath(recording: RecordingWithTranscript, options: ExportOptions): string {
    let folder = options.vaultPath;

    switch (options.folderStructure) {
      case 'by-date': {
        const date = new Date(recording.createdAt);
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        folder = path.join(folder, `${year}`, `${year}-${month}`);
        break;
      }
      case 'by-category': {
        const category = recording.category || 'uncategorized';
        folder = path.join(folder, category);
        break;
      }
      // 'flat' uses vaultPath as-is
    }

    // Sanitize filename
    const filename = this.sanitizeFilename(recording.title) + '.md';

    return path.join(folder, filename);
  }

  private sanitizeFilename(name: string): string {
    return name.replace(/[<>:"/\\|?*]/g, '-').trim();
  }

  private getAudioLink(audioPath: string, options: ExportOptions): string {
    if (options.audioAsAttachment) {
      return `![[${path.basename(audioPath)}]]`;
    } else {
      return `[Audio](${audioPath})`;
    }
  }

  private async copyAudioFile(audioPath: string, markdownPath: string, options: ExportOptions): Promise<void> {
    const attachmentsDir = path.join(path.dirname(markdownPath), 'attachments');
    await fs.mkdir(attachmentsDir, { recursive: true });

    const destPath = path.join(attachmentsDir, path.basename(audioPath));
    await fs.copyFile(audioPath, destPath);
  }

  private async findRelatedRecordings(recording: RecordingWithTranscript): Promise<Array<{ title: string; link: string }>> {
    // Simple implementation: find recordings with same category or overlapping tags
    // In practice, query database for related recordings
    return [];
  }

  async exportBatch(recordingIds: number[], options: ExportOptions): Promise<string[]> {
    const paths: string[] = [];

    for (const id of recordingIds) {
      // Fetch recording with full data
      const recording = await db.getRecordingWithTranscript(id);
      if (recording) {
        const { path } = await this.exportRecording(recording, options);
        paths.push(path);
      }
    }

    return paths;
  }
}
```

### 3. Built-In Templates
Create default templates in `resources/templates/obsidian/`:

```markdown
<!-- resources/templates/obsidian/meeting-notes.md -->
# {{title}}

**Date:** {{formatDate date}}
**Duration:** {{formatDuration duration}}
{{#if category}}**Category:** {{category}}{{/if}}
{{#if tags}}**Tags:** {{#each tags}}#{{this}} {{/each}}{{/if}}

## Summary

{{summary}}

## Action Items

{{#each actionItems}}
- [ ] {{task}}{{#if assignee}} (@{{assignee}}){{/if}}{{#if deadline}} — Due: {{deadline}}{{/if}}
{{/each}}

## Discussion Points

{{#each discussionPoints}}
- {{this}}
{{/each}}

{{#if decisions}}
## Decisions

{{#each decisions}}
- {{this}}
{{/each}}
{{/if}}

## Transcript

{{#each transcript}}
{{#if speaker}}**{{speaker}}** ({{formatTime timestamp}}): {{else}}**({{formatTime timestamp}}):** {{/if}}{{text}}

{{/each}}

{{#if relatedRecordings}}
## Related Recordings

{{#each relatedRecordings}}
- {{wikilink title}}
{{/each}}
{{/if}}

{{#if audioPath}}
## Audio

{{audioPath}}
{{/if}}
```

### 4. IPC Handlers (Main Process)
```typescript
// src/main/ipc/export.ts
import { ipcMain, IpcMainInvokeEvent, dialog } from 'electron';
import { ExportService } from '../services/ExportService';
import { store } from '../store';

const exportService = new ExportService();

export function registerExportHandlers(): void {
  ipcMain.handle('export:obsidian', async (event, recordingId: number, options: any) => {
    const recording = await db.getRecordingWithTranscript(recordingId);
    if (!recording) {
      throw new Error('Recording not found');
    }

    const result = await exportService.exportRecording(recording, options);
    return result;
  });

  ipcMain.handle('export:batch', async (event, recordingIds: number[], options: any) => {
    const paths = await exportService.exportBatch(recordingIds, options);
    return { paths };
  });

  ipcMain.handle('export:preview', async (event, recordingId: number, templateName: string) => {
    const recording = await db.getRecordingWithTranscript(recordingId);
    if (!recording) {
      throw new Error('Recording not found');
    }

    const options = {
      templateName,
      vaultPath: '/tmp',
      folderStructure: 'flat' as const,
      includeAudio: false,
      audioAsAttachment: false,
      generateWikilinks: false,
    };

    const { content } = await exportService.exportRecording(recording, options);
    return { content };
  });

  ipcMain.handle('export:set-vault-path', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Obsidian Vault',
    });

    if (!result.canceled && result.filePaths.length > 0) {
      store.set('obsidianVaultPath', result.filePaths[0]);
      return { path: result.filePaths[0] };
    }

    return { path: null };
  });

  ipcMain.handle('export:get-vault-path', async () => {
    return { path: store.get('obsidianVaultPath') || null };
  });

  ipcMain.handle('export:get-templates', async () => {
    return {
      templates: [
        { name: 'meeting-notes', label: 'Meeting Notes' },
        { name: 'lecture', label: 'Lecture Notes' },
        { name: 'interview', label: 'Interview Transcript' },
        { name: 'basic', label: 'Basic' },
      ],
    };
  });
}
```

### 5. UI Components (Renderer)
```typescript
// src/renderer/components/Export/ExportDialog.tsx
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { FolderOpen } from 'lucide-react';
import { MarkdownPreview } from './MarkdownPreview';

interface Props {
  open: boolean;
  onClose: () => void;
  recordingId: number;
}

export function ExportDialog({ open, onClose, recordingId }: Props) {
  const [template, setTemplate] = useState('meeting-notes');
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [folderStructure, setFolderStructure] = useState<'flat' | 'by-date' | 'by-category'>('by-date');
  const [includeAudio, setIncludeAudio] = useState(true);
  const [preview, setPreview] = useState<string>('');

  useEffect(() => {
    loadVaultPath();
  }, []);

  useEffect(() => {
    if (open) {
      loadPreview();
    }
  }, [open, template]);

  const loadVaultPath = async () => {
    const { path } = await window.api.export.getVaultPath();
    setVaultPath(path);
  };

  const selectVaultPath = async () => {
    const { path } = await window.api.export.setVaultPath();
    if (path) setVaultPath(path);
  };

  const loadPreview = async () => {
    const { content } = await window.api.export.preview(recordingId, template);
    setPreview(content);
  };

  const handleExport = async () => {
    if (!vaultPath) {
      alert('Please select an Obsidian vault first');
      return;
    }

    const options = {
      templateName: template,
      vaultPath,
      folderStructure,
      includeAudio,
      audioAsAttachment: true,
      generateWikilinks: true,
    };

    const result = await window.api.export.obsidian(recordingId, options);
    alert(`Exported to: ${result.path}`);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Export to Obsidian</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-4">
            <div>
              <Label>Template</Label>
              <Select value={template} onValueChange={setTemplate}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="meeting-notes">Meeting Notes</SelectItem>
                  <SelectItem value="lecture">Lecture Notes</SelectItem>
                  <SelectItem value="interview">Interview Transcript</SelectItem>
                  <SelectItem value="basic">Basic</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Obsidian Vault</Label>
              <div className="flex gap-2 mt-1">
                <div className="flex-1 bg-muted rounded px-3 py-2 text-sm truncate">
                  {vaultPath || 'Not selected'}
                </div>
                <Button variant="outline" size="icon" onClick={selectVaultPath}>
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div>
              <Label>Folder Structure</Label>
              <Select value={folderStructure} onValueChange={(v: any) => setFolderStructure(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flat">Flat (all in vault root)</SelectItem>
                  <SelectItem value="by-date">By Date (YYYY/YYYY-MM)</SelectItem>
                  <SelectItem value="by-category">By Category</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label>Include Audio File</Label>
              <Switch checked={includeAudio} onCheckedChange={setIncludeAudio} />
            </div>
          </div>

          <div>
            <Label>Preview</Label>
            <MarkdownPreview content={preview} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleExport}>Export</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

## New Files

```
resources/
└── templates/
    └── obsidian/
        ├── meeting-notes.md
        ├── lecture.md
        ├── interview.md
        └── basic.md
src/
├── main/
│   ├── services/
│   │   ├── ExportService.ts
│   │   └── TemplateEngine.ts
│   └── ipc/
│       └── export.ts
└── renderer/
    └── components/
        └── Export/
            ├── ExportDialog.tsx
            ├── TemplateSelector.tsx
            └── MarkdownPreview.tsx
```

## Testing Strategy

### Unit Tests
- `TemplateEngine.test.ts` — test variable substitution, helpers
- `ExportService.test.ts` — test frontmatter generation, file path logic

### E2E Tests
- Export recording → verify Markdown file created
- Batch export 5 recordings → verify all files created
- Change template → verify preview updates

## Acceptance Criteria

- [ ] Obsidian vault path can be selected via dialog
- [ ] Export generates valid Markdown with YAML frontmatter
- [ ] Wikilinks created for related recordings
- [ ] Templates support all data fields (summary, action items, transcript, etc.)
- [ ] Preview shows rendered Markdown before export
- [ ] Folder structure options work (flat, by-date, by-category)
- [ ] Audio files embedded or linked correctly
- [ ] Batch export works for multiple recordings
- [ ] Custom templates can be added by user (future: template editor)
- [ ] Frontmatter includes all metadata (date, category, tags, speakers)

## Edge Cases & Gotchas

- **Invalid filenames:** Sanitize recording titles to avoid filesystem errors
- **Vault permissions:** Check write access before export
- **Large audio files:** Warn if audio >100 MB before embedding
- **Missing fields:** Handle recordings without summaries/speakers gracefully
- **Obsidian compatibility:** Test with Obsidian desktop app to ensure wikilinks work

## Performance Targets

| Metric | Target |
|--------|--------|
| **Export time** | <1s per recording (excluding audio copy) |
| **Batch export** | <10s for 50 recordings |
| **Preview generation** | <200ms |
