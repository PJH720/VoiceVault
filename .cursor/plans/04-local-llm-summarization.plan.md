---
name: Plan 04 - Local LLM Summarization
overview: node-llama-cpp 기반 로컬 요약 파이프라인을 구축하고 주기 요약/종료 요약/구조화 출력/모델 관리를 포함한 요약 기능을 완성하기 위한 실행 플랜입니다.
todos:
  - id: llm-service
    content: LLMService를 구현해 로컬 모델 로드/추론/정리 수명주기를 안정화한다.
    status: in_progress
  - id: prompt-and-schema
    content: 구조화 요약 프롬프트와 출력 스키마를 설계하고 파싱을 구현한다.
    status: pending
  - id: summarize-scheduler
    content: 60초 주기 요약과 녹음 종료 통합 요약 트리거를 구현한다.
    status: pending
  - id: summary-ui
    content: Summary UI에서 액션 아이템/결정/핵심 포인트를 렌더링한다.
    status: pending
  - id: llm-tests
    content: 로컬 요약 파이프라인의 핵심 동작을 테스트로 검증한다.
    status: pending
isProject: true
---

# Plan 04: Local LLM Summarization

**Phase:** 2 — LLM Summarization
**Priority:** P1 (High Value)
**Effort:** ~2.5 weeks
**Prerequisites:** Plan 02 (transcription), Plan 03 (database)

## Overview

Integrate `node-llama-cpp` for on-device LLM inference using GGUF models (Llama 3.2 3B, gemma-3n). Generate structured summaries every 60 seconds during recording and a comprehensive summary on stop. Parse outputs into action items, discussion points, key statements, and decisions. Stream LLM responses to UI for real-time visibility. Implement model management (download, selection, unload).

## Architecture

### Native Layer

- `src/main/services/LLMService.ts` — wraps `node-llama-cpp`, manages model lifecycle
- `src/main/services/PromptService.ts` — prompt templates and engineering
- Models stored in `app.getPath('userData')/models/llm/`

### IPC Bridge

- `llm:summarize-stream` — start streaming summarization
- `llm:stop` — stop generation
- `llm:download-model` — download GGUF model
- `llm:model-status` — check model availability
- `llm:on-token` — event channel for streaming tokens
- `llm:on-complete` — event channel for structured output

### React Layer

- `src/renderer/hooks/useSummary.ts` — React hook for summaries
- `src/renderer/components/Summary/SummaryView.tsx` — structured summary display
- `src/renderer/components/Summary/ActionItemsList.tsx` — action items with checkboxes

## Implementation Steps

### 1. LLM Service Implementation (Main Process)

1. Install `node-llama-cpp` (`pnpm add node-llama-cpp`)
2. Create `LLMService` class wrapping model loading and inference
3. Implement model download with progress (Hugging Face GGUF repos)
4. Configure GPU acceleration detection (Metal on macOS, CUDA on Linux/Windows if available)
5. Implement streaming chat completion with JSON mode for structured output
6. Handle context window management (4K-8K tokens typical)

```typescript
// src/main/services/LLMService.ts
import { LlamaModel, LlamaContext, LlamaChatSession } from 'node-llama-cpp';
import { app } from 'electron';
import path from 'path';

export interface SummaryOutput {
  summary: string;
  actionItems: ActionItem[];
  discussionPoints: string[];
  keyStatements: KeyStatement[];
  decisions: string[];
}

export interface ActionItem {
  task: string;
  assignee?: string;
  deadline?: string;
  priority?: 'low' | 'medium' | 'high';
}

export interface KeyStatement {
  speaker?: string;
  text: string;
  timestamp: number;
}

export class LLMService {
  private model: LlamaModel | null = null;
  private context: LlamaContext | null = null;
  private session: LlamaChatSession | null = null;
  private modelPath: string;

  constructor(private modelName: string = 'gemma-2-3n-instruct-q4_k_m') {
    this.modelPath = path.join(app.getPath('userData'), 'models', 'llm', `${modelName}.gguf`);
  }

  async initialize(): Promise<void> {
    if (!await this.isModelAvailable()) {
      throw new Error('Model not found. Download required.');
    }

    this.model = new LlamaModel({
      modelPath: this.modelPath,
      gpuLayers: process.platform === 'darwin' ? 'max' : 0, // Metal on macOS
    });

    this.context = new LlamaContext({
      model: this.model,
      contextSize: 8192,
    });

    this.session = new LlamaChatSession({
      context: this.context,
    });
  }

  async summarize(
    transcript: string,
    onToken?: (token: string) => void
  ): Promise<SummaryOutput> {
    if (!this.session) await this.initialize();

    const prompt = this.buildSummarizationPrompt(transcript);

    let fullResponse = '';

    await this.session!.prompt(prompt, {
      temperature: 0.7,
      topK: 40,
      topP: 0.9,
      maxTokens: 1024,
      onToken: (chunk) => {
        fullResponse += chunk;
        onToken?.(chunk);
      },
    });

    return this.parseStructuredOutput(fullResponse);
  }

  private buildSummarizationPrompt(transcript: string): string {
    return `You are a meeting assistant. Analyze the following transcript and generate a structured summary.

Transcript:
${transcript}

Generate a JSON response with this structure:
{
  "summary": "Brief overview in 2-3 sentences",
  "actionItems": [
    {
      "task": "Description of action item",
      "assignee": "Person responsible (if mentioned)",
      "deadline": "Deadline (if mentioned)",
      "priority": "low/medium/high"
    }
  ],
  "discussionPoints": ["Key topic 1", "Key topic 2"],
  "keyStatements": [
    {
      "speaker": "Speaker name (if known)",
      "text": "Important quote or statement",
      "timestamp": 0
    }
  ],
  "decisions": ["Decision 1", "Decision 2"]
}

Respond ONLY with valid JSON. No additional text.`;
  }

  private parseStructuredOutput(response: string): SummaryOutput {
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = response.match(/

```json\n([\s\S]*?)\n

```/) || response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response;

      const parsed = JSON.parse(jsonStr);

      return {
        summary: parsed.summary || '',
        actionItems: parsed.actionItems || [],
        discussionPoints: parsed.discussionPoints || [],
        keyStatements: parsed.keyStatements || [],
        decisions: parsed.decisions || [],
      };
    } catch (error) {
      console.error('Failed to parse LLM output:', error);
      return {
        summary: response,
        actionItems: [],
        discussionPoints: [],
        keyStatements: [],
        decisions: [],
      };
    }
  }

  async downloadModel(onProgress: (percent: number, downloaded: number, total: number) => void): Promise<void> {
    // Download from HuggingFace
    const modelUrl = this.getModelUrl(this.modelName);
    // ... implement chunked download with progress
  }

  private getModelUrl(modelName: string): string {
    const modelMap: Record<string, string> = {
      'gemma-2-3n-instruct-q4_k_m': 'https://huggingface.co/bartowski/gemma-2-3n-instruct-GGUF/resolve/main/gemma-2-3n-instruct-Q4_K_M.gguf',
      'llama-3.2-3b-instruct-q4_k_m': 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    };

    return modelMap[modelName] || modelMap['gemma-2-3n-instruct-q4_k_m'];
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

  async unload(): Promise<void> {
    this.session = null;
    this.context?.dispose();
    this.context = null;
    this.model?.dispose();
    this.model = null;
  }
}
```

### 2. Prompt Service (Main Process)

1. Create `PromptService` with template system
2. Support different prompt types: incremental summary, final summary, specific domains (meeting, lecture, etc.)

```typescript
// src/main/services/PromptService.ts
export class PromptService {
  static incrementalSummary(previousSummary: string, newTranscript: string): string {
    return `You are continuing to summarize an ongoing conversation.

Previous summary:
${previousSummary}

New transcript segment:
${newTranscript}

Update the summary to incorporate the new information. Keep it concise (2-3 sentences). Focus on new developments.

Updated summary:`;
  }

  static finalSummary(transcript: string): string {
    return `Analyze this complete meeting transcript and generate a comprehensive structured summary.

${transcript}

Generate a JSON response with:
- summary: Brief overview
- actionItems: Tasks identified with assignees and deadlines
- discussionPoints: Main topics discussed
- keyStatements: Important quotes
- decisions: Decisions made

Respond with valid JSON only.`;
  }

  static meetingMinutes(transcript: string, attendees: string[]): string {
    return `Generate formal meeting minutes from this transcript.

Attendees: ${attendees.join(', ')}

Transcript:
${transcript}

Format as JSON with sections: summary, attendees, agenda, discussionPoints, actionItems, decisions, nextSteps.`;
  }
}
```

### 3. IPC Handlers (Main Process)

1. Create `src/main/ipc/summarization.ts`
2. Stream tokens via `webContents.send()`
3. Send structured output on completion

```typescript
// src/main/ipc/summarization.ts
import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron';
import { LLMService, SummaryOutput } from '../services/LLMService';

let llmService: LLMService | null = null;

export function registerSummarizationHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('llm:summarize-stream', async (event: IpcMainInvokeEvent, transcript: string) => {
    if (!llmService) {
      llmService = new LLMService();
      await llmService.initialize();
    }

    const result = await llmService.summarize(transcript, (token) => {
      mainWindow.webContents.send('llm:on-token', token);
    });

    mainWindow.webContents.send('llm:on-complete', result);

    return { success: true };
  });

  ipcMain.handle('llm:stop', async () => {
    // Implement generation cancellation
    return { success: true };
  });

  ipcMain.handle('llm:download-model', async (event, modelName: string) => {
    const service = new LLMService(modelName);

    await service.downloadModel((percent, downloaded, total) => {
      event.sender.send('llm:download-progress', { percent, downloaded, total });
    });

    return { success: true };
  });

  ipcMain.handle('llm:model-status', async (event, modelName: string) => {
    const service = new LLMService(modelName);
    const available = await service.isModelAvailable();
    return { available };
  });

  ipcMain.handle('llm:unload', async () => {
    await llmService?.unload();
    llmService = null;
    return { success: true };
  });
}
```

### 4. Preload API (Preload Process)

```typescript
// src/preload/index.ts (extend)
contextBridge.exposeInMainWorld('api', {
  // ... existing APIs

  llm: {
    summarize: (transcript: string) => ipcRenderer.invoke('llm:summarize-stream', transcript),
    stop: () => ipcRenderer.invoke('llm:stop'),
    onToken: (callback: (token: string) => void) => {
      ipcRenderer.on('llm:on-token', (_, token) => callback(token));
    },
    onComplete: (callback: (output: SummaryOutput) => void) => {
      ipcRenderer.on('llm:on-complete', (_, output) => callback(output));
    },
    downloadModel: (modelName: string) => ipcRenderer.invoke('llm:download-model', modelName),
    onDownloadProgress: (callback: (progress: any) => void) => {
      ipcRenderer.on('llm:download-progress', (_, progress) => callback(progress));
    },
    checkModel: (modelName: string) => ipcRenderer.invoke('llm:model-status', modelName),
    unload: () => ipcRenderer.invoke('llm:unload'),
  },
});
```

### 5. React Hook (Renderer)

```typescript
// src/renderer/hooks/useSummary.ts
import { useState, useEffect, useCallback } from 'react';
import type { SummaryOutput } from '@shared/types';

export function useSummary() {
  const [summary, setSummary] = useState<SummaryOutput | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    window.api.llm.onToken((token) => {
      setStreamingText(prev => prev + token);
    });

    window.api.llm.onComplete((output) => {
      setSummary(output);
      setStreamingText('');
      setIsGenerating(false);
    });
  }, []);

  const generateSummary = useCallback(async (transcript: string) => {
    setIsGenerating(true);
    setStreamingText('');
    setSummary(null);

    await window.api.llm.summarize(transcript);
  }, []);

  const stopGeneration = useCallback(async () => {
    await window.api.llm.stop();
    setIsGenerating(false);
  }, []);

  return {
    summary,
    streamingText,
    isGenerating,
    generateSummary,
    stopGeneration,
  };
}
```

### 6. UI Components (Renderer)

```typescript
// src/renderer/components/Summary/SummaryView.tsx
import { useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { useSummary } from '@/hooks/useSummary';
import { useRecording } from '@/contexts/RecordingContext';

export function SummaryView() {
  const { summary, streamingText, isGenerating, generateSummary } = useSummary();
  const { transcript } = useRecording();

  useEffect(() => {
    // Auto-generate summary every 60 seconds during recording
    const interval = setInterval(() => {
      if (transcript.length > 0) {
        const fullTranscript = transcript.map(s => s.text).join(' ');
        generateSummary(fullTranscript);
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [transcript]);

  if (isGenerating) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Generating summary...</p>
        {streamingText && (
          <pre className="mt-4 text-sm text-muted-foreground">{streamingText}</pre>
        )}
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Summary will appear here during recording...
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">{summary.summary}</p>
        </CardContent>
      </Card>

      {summary.actionItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Action Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {summary.actionItems.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <Checkbox id={`action-${idx}`} />
                  <label htmlFor={`action-${idx}`} className="flex-1 text-sm">
                    {item.task}
                    {item.assignee && <Badge variant="outline" className="ml-2">{item.assignee}</Badge>}
                    {item.deadline && <span className="text-muted-foreground ml-2">{item.deadline}</span>}
                  </label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {summary.discussionPoints.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Discussion Points</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1">
              {summary.discussionPoints.map((point, idx) => (
                <li key={idx} className="text-sm">{point}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {summary.decisions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Decisions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1">
              {summary.decisions.map((decision, idx) => (
                <li key={idx} className="text-sm">{decision}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

### 7. Database Schema Extension

```sql
-- Migration: 004_summaries.sql
CREATE TABLE IF NOT EXISTS summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recording_id INTEGER NOT NULL,
  summary_text TEXT NOT NULL,
  action_items TEXT,              -- JSON array
  discussion_points TEXT,         -- JSON array
  key_statements TEXT,            -- JSON array
  decisions TEXT,                 -- JSON array
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
);

CREATE INDEX idx_summaries_recording ON summaries(recording_id);
```

## New Files

```
src/
├── main/
│   ├── services/
│   │   ├── LLMService.ts
│   │   └── PromptService.ts
│   ├── ipc/
│   │   └── summarization.ts
│   └── migrations/
│       └── 004_summaries.sql
└── renderer/
    ├── hooks/
    │   └── useSummary.ts
    └── components/
        └── Summary/
            ├── SummaryView.tsx
            ├── ActionItemsList.tsx
            ├── DiscussionPointsList.tsx
            └── DecisionsList.tsx
```

## Testing Strategy

### Unit Tests

- `LLMService.test.ts` — mock model, test prompt formatting, output parsing
- `PromptService.test.ts` — test template generation

### E2E Tests

- Record 2 min audio → verify summary generated within 60s
- Verify action items parsed correctly
- Test model download flow

## Acceptance Criteria

- LLM initializes on first summarization request
- Summary generated every 60s during recording (incremental)
- Final comprehensive summary on recording stop
- Action items parsed with assignee/deadline
- Discussion points extracted as bullet list
- Decisions highlighted separately
- Streaming tokens show in UI for real-time feedback
- Model download progress shown in Settings
- GPU acceleration (Metal) used on macOS
- Summaries persist to database
- Summary view shows all sections (summary, actions, points, decisions)
- Action items have checkboxes (UI only, state not persisted yet)
- LLM unloads on app quit to free memory

## Edge Cases & Gotchas

- **Context window:** Transcripts >8K tokens need truncation or chunking
- **JSON parsing:** LLM may return malformed JSON → fallback to raw text
- **Model RAM:** 3B Q4 model uses ~2GB RAM, 7B uses ~5GB
- **Slow inference:** Warn if CPU-only, recommend smaller model
- **Empty transcripts:** Skip summarization if <100 words
- **Concurrent requests:** Queue summarization requests, don't run in parallel

## Performance Targets


| Metric                      | Target                                             |
| --------------------------- | -------------------------------------------------- |
| **Summary generation time** | <30s for 500-word transcript (Q4 model, Metal GPU) |
| **Tokens/second**           | >20 t/s on M1/M2, >10 t/s on CPU                   |
| **Memory usage**            | <2.5 GB increase (gemma-2-3n-Q4)                   |
| **Model load time**         | <5s (GGUF from disk)                               |


