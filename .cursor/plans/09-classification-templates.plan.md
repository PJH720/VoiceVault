---
name: Plan 09 - Classification and Templates
overview: 녹음 자동 분류와 템플릿 기반 정리를 위해 분류 서비스, 템플릿 CRUD, 커스텀 편집기, 분류-내보내기 연동을 구축하는 실행 플랜입니다.
todos:
  - id: classification-service
    content: LLM 기반 zero-shot 분류 파이프라인을 구현한다.
    status: pending
  - id: template-schema-manager
    content: 템플릿 스키마/검증/저장소 관리 기능을 구현한다.
    status: pending
  - id: built-in-templates
    content: 기본 템플릿 세트를 정의하고 적용 로직을 구현한다.
    status: pending
  - id: template-editor-ui
    content: 커스텀 템플릿 생성/수정/미리보기 UI를 구현한다.
    status: pending
  - id: classification-integration
    content: 분류 결과를 요약/내보내기 흐름에 일관되게 통합한다.
    status: pending
isProject: true
---

# Plan 09: Classification & Templates

**Phase:** 5 — Export & Classification
**Priority:** P2 (Nice-to-Have)
**Effort:** ~1.5 weeks
**Prerequisites:** Plan 04 (local LLM), Plan 08 (export system)

## Overview

Build a template system for recording classification and auto-organization. Provide 7 built-in templates (meeting, lecture, interview, brainstorm, memo, podcast, personal note) with template-specific summarization prompts. Implement zero-shot LLM classification, custom template creation UI, template-driven export formatting, and a visual template editor with live preview.

## Architecture

### Main Process
- `src/main/services/ClassificationService.ts` — LLM-based auto-classification
- `src/main/services/TemplateManager.ts` — template CRUD and validation
- Templates stored in `resources/templates/classification/` (built-in) and `userData/templates/` (custom)

### IPC Bridge
- `classification:auto-classify` — classify recording by content
- `classification:apply-template` — apply template to recording
- `templates:list` — get all available templates
- `templates:create` — create custom template
- `templates:update` — update template
- `templates:delete` — delete custom template
- `templates:export` — export template as JSON

### React Layer
- `src/renderer/components/Templates/TemplateEditor.tsx` — visual template editor
- `src/renderer/components/Templates/TemplateLibrary.tsx` — browse templates
- `src/renderer/components/Templates/ClassificationBadge.tsx` — show classification result

## Implementation Steps

### 1. Template Schema
1. Define template structure with metadata and prompts
2. Support template inheritance (extend base templates)
3. Include validation rules

```typescript
// src/shared/types.ts (extend)
export interface RecordingTemplate {
  id: string;
  name: string;
  description: string;
  icon: string; // emoji or icon name
  color: string;
  category: 'built-in' | 'custom';

  // Classification
  keywords: string[]; // for keyword-based classification fallback

  // Summarization prompts
  prompts: {
    summary: string;
    actionItems?: string;
    keyPoints?: string;
    customFields?: Array<{ name: string; prompt: string }>;
  };

  // Export template
  exportTemplate?: string; // Handlebars template for Obsidian export

  // Metadata
  createdAt: string;
  updatedAt: string;
  author?: string;
}
```

### 2. Built-In Templates
Create 7 default templates in `resources/templates/classification/`:

```json
// meeting.json
{
  "id": "meeting",
  "name": "Meeting",
  "description": "Team meetings, standups, planning sessions",
  "icon": "👥",
  "color": "#3b82f6",
  "category": "built-in",
  "keywords": ["meeting", "standup", "sync", "agenda", "attendees"],
  "prompts": {
    "summary": "Summarize this meeting in 2-3 sentences. Focus on decisions made and next steps.",
    "actionItems": "Extract all action items with assignees and deadlines. Format as: [TASK] - Assignee: [NAME] - Deadline: [DATE]",
    "keyPoints": "List the 3-5 most important discussion points from this meeting."
  },
  "exportTemplate": "meeting-notes.md"
}

// lecture.json
{
  "id": "lecture",
  "name": "Lecture",
  "description": "Educational lectures, courses, talks",
  "icon": "🎓",
  "color": "#8b5cf6",
  "category": "built-in",
  "keywords": ["lecture", "course", "professor", "slides", "homework"],
  "prompts": {
    "summary": "Summarize this lecture's main teaching points in 3-4 sentences.",
    "keyPoints": "Extract the key concepts taught in this lecture. Include definitions of important terms.",
    "customFields": [
      { "name": "prerequisites", "prompt": "What prior knowledge is assumed or required?" },
      { "name": "homework", "prompt": "Are there any homework assignments or exercises mentioned?" }
    ]
  }
}

// interview.json
{
  "id": "interview",
  "name": "Interview",
  "description": "Job interviews, user research, journalism",
  "icon": "🎤",
  "color": "#ef4444",
  "category": "built-in",
  "keywords": ["interview", "candidate", "questions", "answers"],
  "prompts": {
    "summary": "Summarize this interview, highlighting the candidate's background and key responses.",
    "keyPoints": "Extract the most important questions asked and answers given.",
    "customFields": [
      { "name": "strengths", "prompt": "What are the interviewee's main strengths based on their responses?" },
      { "name": "concerns", "prompt": "Are there any concerns or red flags mentioned?" }
    ]
  }
}

// brainstorm.json
{
  "id": "brainstorm",
  "name": "Brainstorm",
  "description": "Ideation sessions, creative workshops",
  "icon": "💡",
  "color": "#f59e0b",
  "category": "built-in",
  "keywords": ["brainstorm", "ideas", "creative", "innovation"],
  "prompts": {
    "summary": "Summarize the brainstorming session and its main themes.",
    "keyPoints": "List all unique ideas generated, grouped by theme.",
    "customFields": [
      { "name": "topIdeas", "prompt": "Which 3 ideas received the most positive feedback or discussion?" }
    ]
  }
}

// memo.json, podcast.json, personal-note.json (similar structure)
```

### 3. Classification Service (Main Process)
1. Implement LLM-based zero-shot classification
2. Fallback to keyword matching if LLM unavailable
3. Support confidence scores

```typescript
// src/main/services/ClassificationService.ts
import { LLMService } from './LLMService';
import { TemplateManager } from './TemplateManager';
import type { RecordingTemplate } from '@shared/types';

export interface ClassificationResult {
  templateId: string;
  confidence: number;
  reasoning?: string;
}

export class ClassificationService {
  constructor(
    private llmService: LLMService,
    private templateManager: TemplateManager
  ) {}

  async classifyRecording(transcript: string): Promise<ClassificationResult> {
    const templates = await this.templateManager.listTemplates();

    try {
      // LLM-based classification
      return await this.classifyWithLLM(transcript, templates);
    } catch (error) {
      console.warn('LLM classification failed, falling back to keywords:', error);
      return this.classifyWithKeywords(transcript, templates);
    }
  }

  private async classifyWithLLM(
    transcript: string,
    templates: RecordingTemplate[]
  ): Promise<ClassificationResult> {
    const templateDescriptions = templates.map(t =>
      `${t.id}: ${t.name} - ${t.description}`
    ).join('\n');

    const prompt = `Classify this transcript into ONE of the following categories:

${templateDescriptions}

Transcript (first 500 words):
${this.truncate(transcript, 500)}

Respond with ONLY the category ID (e.g., "meeting", "lecture", etc.). No explanation.`;

    let classification = '';
    await this.llmService.summarize(prompt, (token) => {
      classification += token;
    });

    const templateId = classification.trim().toLowerCase();

    // Validate that returned ID exists
    if (templates.some(t => t.id === templateId)) {
      return {
        templateId,
        confidence: 0.85, // LLM classifications assumed high confidence
        reasoning: 'Classified by LLM',
      };
    }

    // Fallback if invalid ID
    return this.classifyWithKeywords(transcript, templates);
  }

  private classifyWithKeywords(
    transcript: string,
    templates: RecordingTemplate[]
  ): ClassificationResult {
    const lowerTranscript = transcript.toLowerCase();
    const scores = new Map<string, number>();

    templates.forEach(template => {
      let score = 0;
      template.keywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        const matches = lowerTranscript.match(regex);
        score += matches ? matches.length : 0;
      });
      scores.set(template.id, score);
    });

    const sorted = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
    const [topId, topScore] = sorted[0];

    // If no keywords matched, default to 'personal-note'
    if (topScore === 0) {
      return {
        templateId: 'personal-note',
        confidence: 0.3,
        reasoning: 'No keywords matched, defaulting to personal note',
      };
    }

    const totalScore = Array.from(scores.values()).reduce((a, b) => a + b, 0);
    const confidence = topScore / totalScore;

    return {
      templateId: topId,
      confidence,
      reasoning: `Keyword matching (${topScore} matches)`,
    };
  }

  private truncate(text: string, wordCount: number): string {
    return text.split(/\s+/).slice(0, wordCount).join(' ');
  }
}
```

### 4. Template Manager (Main Process)
1. Load built-in and custom templates
2. CRUD operations for custom templates
3. Validation and persistence

```typescript
// src/main/services/TemplateManager.ts
import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import type { RecordingTemplate } from '@shared/types';

export class TemplateManager {
  private builtInPath: string;
  private customPath: string;
  private templates: Map<string, RecordingTemplate> = new Map();

  constructor() {
    this.builtInPath = path.join(app.getAppPath(), 'resources', 'templates', 'classification');
    this.customPath = path.join(app.getPath('userData'), 'templates');
  }

  async initialize(): Promise<void> {
    await this.loadBuiltInTemplates();
    await this.loadCustomTemplates();
  }

  private async loadBuiltInTemplates(): Promise<void> {
    try {
      const files = await fs.readdir(this.builtInPath);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = await fs.readFile(path.join(this.builtInPath, file), 'utf-8');
          const template = JSON.parse(content) as RecordingTemplate;
          this.templates.set(template.id, template);
        }
      }
    } catch (error) {
      console.warn('Failed to load built-in templates:', error);
    }
  }

  private async loadCustomTemplates(): Promise<void> {
    try {
      await fs.mkdir(this.customPath, { recursive: true });
      const files = await fs.readdir(this.customPath);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = await fs.readFile(path.join(this.customPath, file), 'utf-8');
          const template = JSON.parse(content) as RecordingTemplate;
          template.category = 'custom';
          this.templates.set(template.id, template);
        }
      }
    } catch (error) {
      console.warn('Failed to load custom templates:', error);
    }
  }

  async listTemplates(): Promise<RecordingTemplate[]> {
    return Array.from(this.templates.values());
  }

  async getTemplate(id: string): Promise<RecordingTemplate | null> {
    return this.templates.get(id) || null;
  }

  async createTemplate(template: Omit<RecordingTemplate, 'id' | 'category' | 'createdAt' | 'updatedAt'>): Promise<RecordingTemplate> {
    const id = this.generateId(template.name);

    const fullTemplate: RecordingTemplate = {
      ...template,
      id,
      category: 'custom',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Validate
    this.validateTemplate(fullTemplate);

    // Save to disk
    await this.saveTemplate(fullTemplate);

    // Add to cache
    this.templates.set(id, fullTemplate);

    return fullTemplate;
  }

  async updateTemplate(id: string, updates: Partial<RecordingTemplate>): Promise<void> {
    const existing = this.templates.get(id);
    if (!existing) {
      throw new Error('Template not found');
    }

    if (existing.category === 'built-in') {
      throw new Error('Cannot modify built-in templates');
    }

    const updated = {
      ...existing,
      ...updates,
      id, // Preserve ID
      category: 'custom' as const,
      updatedAt: new Date().toISOString(),
    };

    this.validateTemplate(updated);
    await this.saveTemplate(updated);
    this.templates.set(id, updated);
  }

  async deleteTemplate(id: string): Promise<void> {
    const template = this.templates.get(id);
    if (!template) {
      throw new Error('Template not found');
    }

    if (template.category === 'built-in') {
      throw new Error('Cannot delete built-in templates');
    }

    const filePath = path.join(this.customPath, `${id}.json`);
    await fs.unlink(filePath);
    this.templates.delete(id);
  }

  private async saveTemplate(template: RecordingTemplate): Promise<void> {
    const filePath = path.join(this.customPath, `${template.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(template, null, 2), 'utf-8');
  }

  private validateTemplate(template: RecordingTemplate): void {
    if (!template.id || !template.name) {
      throw new Error('Template must have id and name');
    }

    if (!template.prompts || !template.prompts.summary) {
      throw new Error('Template must have at least a summary prompt');
    }
  }

  private generateId(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
  }
}
```

### 5. IPC Handlers (Main Process)
```typescript
// src/main/ipc/classification.ts
import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { ClassificationService } from '../services/ClassificationService';
import { TemplateManager } from '../services/TemplateManager';

export function registerClassificationHandlers(): void {
  const templateManager = new TemplateManager();
  const classificationService = new ClassificationService(llmService, templateManager);

  templateManager.initialize();

  ipcMain.handle('classification:auto-classify', async (event, transcript: string) => {
    return await classificationService.classifyRecording(transcript);
  });

  ipcMain.handle('classification:apply-template', async (event, recordingId: number, templateId: string) => {
    // Apply template's prompts to generate custom summary
    const template = await templateManager.getTemplate(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    const recording = await db.getRecordingWithTranscript(recordingId);
    if (!recording) {
      throw new Error('Recording not found');
    }

    const transcript = recording.segments.map(s => s.text).join(' ');

    // Generate summary using template's prompts
    // ... implementation

    return { success: true };
  });

  ipcMain.handle('templates:list', async () => {
    return await templateManager.listTemplates();
  });

  ipcMain.handle('templates:get', async (event, id: string) => {
    return await templateManager.getTemplate(id);
  });

  ipcMain.handle('templates:create', async (event, template: any) => {
    return await templateManager.createTemplate(template);
  });

  ipcMain.handle('templates:update', async (event, id: string, updates: any) => {
    await templateManager.updateTemplate(id, updates);
    return { success: true };
  });

  ipcMain.handle('templates:delete', async (event, id: string) => {
    await templateManager.deleteTemplate(id);
    return { success: true };
  });
}
```

### 6. UI Components (Renderer)
```typescript
// src/renderer/components/Templates/TemplateEditor.tsx
import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2 } from 'lucide-react';

export function TemplateEditor({ templateId, onSave, onCancel }: any) {
  const [template, setTemplate] = useState({
    name: '',
    description: '',
    icon: '📄',
    color: '#6b7280',
    keywords: [] as string[],
    prompts: {
      summary: '',
      actionItems: '',
      keyPoints: '',
      customFields: [] as Array<{ name: string; prompt: string }>,
    },
  });

  const [keywordInput, setKeywordInput] = useState('');

  const addKeyword = () => {
    if (keywordInput.trim()) {
      setTemplate(prev => ({
        ...prev,
        keywords: [...prev.keywords, keywordInput.trim()],
      }));
      setKeywordInput('');
    }
  };

  const removeKeyword = (index: number) => {
    setTemplate(prev => ({
      ...prev,
      keywords: prev.keywords.filter((_, i) => i !== index),
    }));
  };

  const addCustomField = () => {
    setTemplate(prev => ({
      ...prev,
      prompts: {
        ...prev.prompts,
        customFields: [...prev.prompts.customFields, { name: '', prompt: '' }],
      },
    }));
  };

  const handleSave = async () => {
    if (templateId) {
      await window.api.templates.update(templateId, template);
    } else {
      await window.api.templates.create(template);
    }
    onSave();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{templateId ? 'Edit Template' : 'Create Template'}</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Name</Label>
            <Input
              value={template.name}
              onChange={(e) => setTemplate(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Meeting Notes"
            />
          </div>

          <div>
            <Label>Icon (emoji)</Label>
            <Input
              value={template.icon}
              onChange={(e) => setTemplate(prev => ({ ...prev, icon: e.target.value }))}
              placeholder="👥"
              maxLength={2}
            />
          </div>
        </div>

        <div>
          <Label>Description</Label>
          <Input
            value={template.description}
            onChange={(e) => setTemplate(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Team meetings, standups, planning sessions"
          />
        </div>

        <div>
          <Label>Keywords (for classification)</Label>
          <div className="flex gap-2">
            <Input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
              placeholder="Add keyword..."
            />
            <Button onClick={addKeyword} size="sm">Add</Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {template.keywords.map((keyword, idx) => (
              <Badge key={idx} variant="secondary">
                {keyword}
                <button onClick={() => removeKeyword(idx)} className="ml-1">×</button>
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <Label>Summary Prompt</Label>
          <Textarea
            value={template.prompts.summary}
            onChange={(e) => setTemplate(prev => ({
              ...prev,
              prompts: { ...prev.prompts, summary: e.target.value },
            }))}
            placeholder="Summarize this meeting in 2-3 sentences..."
            rows={3}
          />
        </div>

        <div>
          <Label>Action Items Prompt (optional)</Label>
          <Textarea
            value={template.prompts.actionItems}
            onChange={(e) => setTemplate(prev => ({
              ...prev,
              prompts: { ...prev.prompts, actionItems: e.target.value },
            }))}
            placeholder="Extract all action items..."
            rows={2}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Custom Fields</Label>
            <Button variant="outline" size="sm" onClick={addCustomField}>
              <Plus className="h-4 w-4 mr-1" /> Add Field
            </Button>
          </div>

          {template.prompts.customFields.map((field, idx) => (
            <div key={idx} className="border rounded p-3 mb-2 space-y-2">
              <div className="flex justify-between items-center">
                <Input
                  placeholder="Field name (e.g., 'Prerequisites')"
                  value={field.name}
                  onChange={(e) => {
                    const updated = [...template.prompts.customFields];
                    updated[idx].name = e.target.value;
                    setTemplate(prev => ({
                      ...prev,
                      prompts: { ...prev.prompts, customFields: updated },
                    }));
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const updated = template.prompts.customFields.filter((_, i) => i !== idx);
                    setTemplate(prev => ({
                      ...prev,
                      prompts: { ...prev.prompts, customFields: updated },
                    }));
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Textarea
                placeholder="Prompt for this field..."
                value={field.prompt}
                onChange={(e) => {
                  const updated = [...template.prompts.customFields];
                  updated[idx].prompt = e.target.value;
                  setTemplate(prev => ({
                    ...prev,
                    prompts: { ...prev.prompts, customFields: updated },
                  }));
                }}
                rows={2}
              />
            </div>
          ))}
        </div>
      </CardContent>

      <CardFooter className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave}>Save Template</Button>
      </CardFooter>
    </Card>
  );
}
```

### 7. Database Schema Extension
```sql
-- Migration: 007_templates.sql
-- Add template classification to recordings
ALTER TABLE recordings ADD COLUMN template_id TEXT;
ALTER TABLE recordings ADD COLUMN classification_confidence REAL;

CREATE INDEX idx_recordings_template ON recordings(template_id);
```

## New Files

```
resources/
└── templates/
    └── classification/
        ├── meeting.json
        ├── lecture.json
        ├── interview.json
        ├── brainstorm.json
        ├── memo.json
        ├── podcast.json
        └── personal-note.json
src/
├── main/
│   ├── services/
│   │   ├── ClassificationService.ts
│   │   └── TemplateManager.ts
│   ├── ipc/
│   │   └── classification.ts
│   └── migrations/
│       └── 007_templates.sql
└── renderer/
    └── components/
        └── Templates/
            ├── TemplateEditor.tsx
            ├── TemplateLibrary.tsx
            ├── ClassificationBadge.tsx
            └── TemplateCard.tsx
```

## Testing Strategy

### Unit Tests
- `ClassificationService.test.ts` — test LLM and keyword classification
- `TemplateManager.test.ts` — test CRUD operations, validation

### E2E Tests
- Create custom template → verify saved to disk
- Auto-classify recording → verify correct template assigned
- Apply template → verify custom summary generated

## Acceptance Criteria

- [ ] 7 built-in templates available
- [ ] Auto-classification assigns correct template with >70% accuracy
- [ ] Template editor allows creating custom templates
- [ ] Custom fields can be added to templates
- [ ] Keywords help with classification fallback
- [ ] Templates can be exported/imported as JSON
- [ ] Template-specific prompts generate better summaries
- [ ] Classification confidence shown in UI
- [ ] Built-in templates cannot be edited or deleted
- [ ] Custom templates saved to userData directory
- [ ] Template library shows all templates with icons
- [ ] Applying template regenerates summary with custom prompts

## Edge Cases & Gotchas

- **Ambiguous content:** Recording may fit multiple templates → use confidence threshold
- **No LLM available:** Keyword classification should still work
- **Empty transcript:** Cannot classify → default to 'personal-note'
- **Template conflicts:** User may manually override auto-classification
- **Custom field limits:** Cap at 10 custom fields per template to avoid prompt bloat

## Performance Targets

| Metric | Target |
|--------|--------|
| **Classification time** | <5s (LLM), <100ms (keyword) |
| **Template load time** | <50ms for all templates |
| **Custom template save** | <200ms |
