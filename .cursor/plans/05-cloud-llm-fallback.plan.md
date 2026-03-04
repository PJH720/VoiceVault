---
name: Plan 05 - Cloud LLM Fallback
overview: 로컬 요약을 유지하면서 Claude API 기반 클라우드 요약 fallback 경로를 추가하고, 키 관리/비용 추정/프라이버시 토글/사용량 추적을 제공하기 위한 실행 플랜입니다.
todos:
  - id: cloud-llm-service
    content: CloudLLMService를 구현해 클라우드 요약 호출과 오류 재시도를 처리한다.
    status: completed
  - id: api-key-management
    content: API 키 저장/마스킹/갱신 흐름을 안전하게 구현한다.
    status: completed
  - id: cost-and-usage
    content: 비용 추정 및 사용량 집계를 구현해 요약 전후 정보를 제공한다.
    status: completed
  - id: local-cloud-switch
    content: 로컬/클라우드 요약 전환 로직을 기존 요약 인터페이스에 통합한다.
    status: completed
  - id: privacy-guardrails
    content: local-only 모드 및 전송 제어 옵션을 검증 가능한 형태로 구현한다.
    status: completed
isProject: true
---

# Plan 05: Cloud LLM Fallback

**Phase:** 2 — LLM Summarization
**Priority:** P2 (Nice-to-Have)
**Effort:** ~1 week
**Prerequisites:** Plan 04 (local LLM working)

## Overview

Add optional Claude API integration as a fallback/upgrade path for higher-quality summaries. Implement API key management via `electron-store`, model selection UI (Claude 3.5 Sonnet, Opus, Haiku), cost estimation before generation, privacy toggles (local-only mode), and usage tracking. Provide seamless switching between local and cloud LLM without changing the summarization interface.

## Architecture

### Main Process

- `src/main/services/CloudLLMService.ts` — Anthropic API client wrapper
- `src/main/services/CostEstimator.ts` — token counting and pricing calculation
- API keys stored in `electron-store` (encrypted at rest)

### IPC Bridge

- `cloud-llm:summarize` — trigger cloud summarization
- `cloud-llm:set-api-key` — securely store API key
- `cloud-llm:get-api-key` — retrieve masked API key (sk-...XXXX)
- `cloud-llm:estimate-cost` — calculate cost before generation
- `cloud-llm:usage-stats` — get usage statistics

### React Layer

- `src/renderer/components/Settings/LLMSettings.tsx` — model selection and API key input
- `src/renderer/components/Settings/PrivacyToggle.tsx` — local-only mode toggle
- `src/renderer/components/Summary/CostEstimate.tsx` — show estimated cost before generation

## Implementation Steps

### 1. Cloud LLM Service (Main Process)

1. Install Anthropic SDK (`pnpm add @anthropic-ai/sdk`)
2. Create `CloudLLMService` wrapping Claude API
3. Implement streaming chat with structured outputs (JSON mode)
4. Handle rate limiting and retries
5. Store API responses in database for audit trail

```typescript
// src/main/services/CloudLLMService.ts
import Anthropic from '@anthropic-ai/sdk';
import type { SummaryOutput } from './LLMService';

export class CloudLLMService {
  private client: Anthropic | null = null;

  constructor(private apiKey: string) {
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
  }

  async summarize(
    transcript: string,
    model: 'claude-3-5-sonnet-20241022' | 'claude-3-opus-20240229' | 'claude-3-haiku-20240307' = 'claude-3-5-sonnet-20241022',
    onToken?: (token: string) => void
  ): Promise<SummaryOutput> {
    if (!this.client) {
      throw new Error('API key not configured');
    }

    const systemPrompt = `You are a meeting assistant. Generate structured summaries in JSON format with these fields:
- summary: Brief overview (2-3 sentences)
- actionItems: Array of {task, assignee?, deadline?, priority?}
- discussionPoints: Array of key topics discussed
- keyStatements: Array of {speaker?, text, timestamp}
- decisions: Array of decisions made

Respond ONLY with valid JSON.`;

    const userPrompt = `Analyze this transcript and generate a structured summary:\n\n${transcript}`;

    let fullText = '';

    const stream = await this.client.messages.stream({
      model,
      max_tokens: 2048,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userPrompt,
      }],
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        const text = chunk.delta.text;
        fullText += text;
        onToken?.(text);
      }
    }

    const response = await stream.finalMessage();

    return this.parseStructuredOutput(fullText, {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model,
    });
  }

  private parseStructuredOutput(text: string, usage: any): SummaryOutput {
    try {
      const jsonMatch = text.match(/

```json\n([\s\S]*?)\n

```/) || text.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
      const parsed = JSON.parse(jsonStr);

      return {
        summary: parsed.summary || '',
        actionItems: parsed.actionItems || [],
        discussionPoints: parsed.discussionPoints || [],
        keyStatements: parsed.keyStatements || [],
        decisions: parsed.decisions || [],
        metadata: {
          provider: 'anthropic',
          model: usage.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cost: this.calculateCost(usage.model, usage.inputTokens, usage.outputTokens),
        },
      };
    } catch (error) {
      console.error('Failed to parse Claude output:', error);
      return {
        summary: text,
        actionItems: [],
        discussionPoints: [],
        keyStatements: [],
        decisions: [],
      };
    }
  }

  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing: Record<string, { input: number; output: number }> = {
      'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 }, // per 1K tokens
      'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
      'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
    };

    const prices = pricing[model] || pricing['claude-3-5-sonnet-20241022'];

    return (
      (inputTokens / 1000) * prices.input +
      (outputTokens / 1000) * prices.output
    );
  }

  isConfigured(): boolean {
    return this.client !== null;
  }
}
```

### 2. Cost Estimator (Main Process)

1. Implement token counting (approximate via character count)
2. Calculate costs based on current pricing

```typescript
// src/main/services/CostEstimator.ts
export class CostEstimator {
  static estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  static estimateCost(
    inputText: string,
    model: string,
    estimatedOutputTokens: number = 500
  ): { inputTokens: number; outputTokens: number; cost: number } {
    const inputTokens = this.estimateTokens(inputText);

    const pricing: Record<string, { input: number; output: number }> = {
      'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
      'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
      'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
    };

    const prices = pricing[model] || pricing['claude-3-5-sonnet-20241022'];

    const cost = (
      (inputTokens / 1000) * prices.input +
      (estimatedOutputTokens / 1000) * prices.output
    );

    return { inputTokens, outputTokens: estimatedOutputTokens, cost };
  }
}
```

### 3. Secure API Key Storage (Main Process)

1. Use `electron-store` with encryption
2. Never expose full API key to renderer

```typescript
// src/main/store.ts (extend existing)
import Store from 'electron-store';
import { safeStorage } from 'electron';

interface StoreSchema {
  anthropicApiKey?: string;
  preferredLLMProvider: 'local' | 'cloud';
  cloudModel: string;
  localOnlyMode: boolean;
  usageStats: {
    totalCost: number;
    totalRequests: number;
    lastReset: string;
  };
}

export const store = new Store<StoreSchema>({
  defaults: {
    preferredLLMProvider: 'local',
    cloudModel: 'claude-3-5-sonnet-20241022',
    localOnlyMode: false,
    usageStats: {
      totalCost: 0,
      totalRequests: 0,
      lastReset: new Date().toISOString(),
    },
  },
  encryptionKey: process.platform === 'darwin'
    ? safeStorage.isEncryptionAvailable() ? 'obfuscate' : undefined
    : undefined,
});

export function setAnthropicApiKey(key: string): void {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(key);
    store.set('anthropicApiKey', encrypted.toString('base64'));
  } else {
    store.set('anthropicApiKey', key);
  }
}

export function getAnthropicApiKey(): string | null {
  const stored = store.get('anthropicApiKey');
  if (!stored) return null;

  if (safeStorage.isEncryptionAvailable()) {
    try {
      const buffer = Buffer.from(stored, 'base64');
      return safeStorage.decryptString(buffer);
    } catch {
      return null;
    }
  }

  return stored;
}

export function maskApiKey(key: string): string {
  if (key.length < 10) return '***';
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
}
```

### 4. IPC Handlers (Main Process)

```typescript
// src/main/ipc/cloud-llm.ts
import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron';
import { CloudLLMService } from '../services/CloudLLMService';
import { CostEstimator } from '../services/CostEstimator';
import { getAnthropicApiKey, setAnthropicApiKey, maskApiKey, store } from '../store';

export function registerCloudLLMHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('cloud-llm:set-api-key', async (_, key: string) => {
    setAnthropicApiKey(key);
    return { success: true };
  });

  ipcMain.handle('cloud-llm:get-api-key', async () => {
    const key = getAnthropicApiKey();
    return { key: key ? maskApiKey(key) : null };
  });

  ipcMain.handle('cloud-llm:summarize', async (event, transcript: string, model: string) => {
    const apiKey = getAnthropicApiKey();
    if (!apiKey) {
      throw new Error('API key not configured');
    }

    if (store.get('localOnlyMode')) {
      throw new Error('Cloud LLM disabled in local-only mode');
    }

    const service = new CloudLLMService(apiKey);

    const result = await service.summarize(transcript, model as any, (token) => {
      mainWindow.webContents.send('cloud-llm:on-token', token);
    });

    // Update usage stats
    const stats = store.get('usageStats');
    store.set('usageStats', {
      totalCost: stats.totalCost + (result.metadata?.cost || 0),
      totalRequests: stats.totalRequests + 1,
      lastReset: stats.lastReset,
    });

    mainWindow.webContents.send('cloud-llm:on-complete', result);

    return { success: true };
  });

  ipcMain.handle('cloud-llm:estimate-cost', async (_, text: string, model: string) => {
    return CostEstimator.estimateCost(text, model);
  });

  ipcMain.handle('cloud-llm:usage-stats', async () => {
    return store.get('usageStats');
  });

  ipcMain.handle('cloud-llm:reset-stats', async () => {
    store.set('usageStats', {
      totalCost: 0,
      totalRequests: 0,
      lastReset: new Date().toISOString(),
    });
    return { success: true };
  });

  ipcMain.handle('cloud-llm:set-local-only', async (_, enabled: boolean) => {
    store.set('localOnlyMode', enabled);
    return { success: true };
  });

  ipcMain.handle('cloud-llm:get-local-only', async () => {
    return { enabled: store.get('localOnlyMode') };
  });
}
```

### 5. Preload API (Preload Process)

```typescript
// src/preload/index.ts (extend)
contextBridge.exposeInMainWorld('api', {
  // ... existing APIs

  cloudLLM: {
    setApiKey: (key: string) => ipcRenderer.invoke('cloud-llm:set-api-key', key),
    getApiKey: () => ipcRenderer.invoke('cloud-llm:get-api-key'),
    summarize: (transcript: string, model: string) =>
      ipcRenderer.invoke('cloud-llm:summarize', transcript, model),
    onToken: (callback: (token: string) => void) => {
      ipcRenderer.on('cloud-llm:on-token', (_, token) => callback(token));
    },
    onComplete: (callback: (output: any) => void) => {
      ipcRenderer.on('cloud-llm:on-complete', (_, output) => callback(output));
    },
    estimateCost: (text: string, model: string) =>
      ipcRenderer.invoke('cloud-llm:estimate-cost', text, model),
    getUsageStats: () => ipcRenderer.invoke('cloud-llm:usage-stats'),
    resetStats: () => ipcRenderer.invoke('cloud-llm:reset-stats'),
    setLocalOnly: (enabled: boolean) => ipcRenderer.invoke('cloud-llm:set-local-only', enabled),
    getLocalOnly: () => ipcRenderer.invoke('cloud-llm:get-local-only'),
  },
});
```

### 6. Settings UI (Renderer)

```typescript
// src/renderer/components/Settings/LLMSettings.tsx
import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

export function LLMSettings() {
  const [apiKey, setApiKey] = useState('');
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [cloudModel, setCloudModel] = useState('claude-3-5-sonnet-20241022');
  const [localOnlyMode, setLocalOnlyMode] = useState(false);
  const [usageStats, setUsageStats] = useState({ totalCost: 0, totalRequests: 0 });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const { key } = await window.api.cloudLLM.getApiKey();
    setMaskedKey(key);

    const { enabled } = await window.api.cloudLLM.getLocalOnly();
    setLocalOnlyMode(enabled);

    const stats = await window.api.cloudLLM.getUsageStats();
    setUsageStats(stats);
  };

  const saveApiKey = async () => {
    await window.api.cloudLLM.setApiKey(apiKey);
    setApiKey('');
    await loadSettings();
  };

  const toggleLocalOnly = async (enabled: boolean) => {
    await window.api.cloudLLM.setLocalOnly(enabled);
    setLocalOnlyMode(enabled);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cloud LLM (Optional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Anthropic API Key</Label>
            <div className="flex gap-2 mt-1">
              <Input
                type="password"
                placeholder="sk-ant-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={localOnlyMode}
              />
              <Button onClick={saveApiKey} disabled={localOnlyMode}>Save</Button>
            </div>
            {maskedKey && (
              <p className="text-sm text-muted-foreground mt-1">
                Current: {maskedKey}
              </p>
            )}
          </div>

          <div>
            <Label>Cloud Model</Label>
            <Select value={cloudModel} onValueChange={setCloudModel} disabled={localOnlyMode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="claude-3-5-sonnet-20241022">
                  Claude 3.5 Sonnet <Badge variant="secondary" className="ml-2">Recommended</Badge>
                </SelectItem>
                <SelectItem value="claude-3-opus-20240229">
                  Claude 3 Opus <Badge variant="secondary" className="ml-2">Highest Quality</Badge>
                </SelectItem>
                <SelectItem value="claude-3-haiku-20240307">
                  Claude 3 Haiku <Badge variant="secondary" className="ml-2">Fastest</Badge>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Local-Only Mode</Label>
              <p className="text-sm text-muted-foreground">Never use cloud APIs</p>
            </div>
            <Switch checked={localOnlyMode} onCheckedChange={toggleLocalOnly} />
          </div>

          {localOnlyMode && (
            <Alert>
              <AlertDescription>
                Cloud LLM is disabled. Only local models will be used.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage Statistics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between">
            <span>Total Requests:</span>
            <span className="font-semibold">{usageStats.totalRequests}</span>
          </div>
          <div className="flex justify-between">
            <span>Total Cost:</span>
            <span className="font-semibold">${usageStats.totalCost.toFixed(4)}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.api.cloudLLM.resetStats().then(loadSettings)}
          >
            Reset Stats
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

### 7. Cost Estimate Component (Renderer)

```typescript
// src/renderer/components/Summary/CostEstimate.tsx
import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DollarSign } from 'lucide-react';

interface Props {
  transcript: string;
  model: string;
}

export function CostEstimate({ transcript, model }: Props) {
  const [estimate, setEstimate] = useState<any>(null);

  useEffect(() => {
    window.api.cloudLLM.estimateCost(transcript, model).then(setEstimate);
  }, [transcript, model]);

  if (!estimate) return null;

  return (
    <Alert>
      <DollarSign className="h-4 w-4" />
      <AlertDescription>
        Estimated cost: <strong>${estimate.cost.toFixed(4)}</strong> ({estimate.inputTokens} input + {estimate.outputTokens} output tokens)
      </AlertDescription>
    </Alert>
  );
}
```

## New Files

```
src/
├── main/
│   ├── services/
│   │   ├── CloudLLMService.ts
│   │   └── CostEstimator.ts
│   └── ipc/
│       └── cloud-llm.ts
└── renderer/
    └── components/
        ├── Settings/
        │   ├── LLMSettings.tsx
        │   └── PrivacyToggle.tsx
        └── Summary/
            └── CostEstimate.tsx
```

## Testing Strategy

### Unit Tests

- `CloudLLMService.test.ts` — mock Anthropic SDK, test response parsing
- `CostEstimator.test.ts` — verify token estimation accuracy

### E2E Tests

- Save API key → verify masked display
- Generate cloud summary → verify result and cost tracking
- Enable local-only mode → verify cloud requests blocked

## Acceptance Criteria

- API key saved securely with `electron-store` encryption
- API key displayed masked in UI (sk-ant-...XXXX)
- Cloud model selection (Sonnet, Opus, Haiku) works
- Cost estimate shown before generation
- Usage stats track total cost and request count
- Local-only mode toggle disables cloud APIs
- Cloud summaries have same structure as local summaries
- Streaming tokens display in UI (same as local LLM)
- Error handling for invalid API key, rate limits, network issues
- Summary metadata includes provider, model, tokens, cost
- Settings page has "Reset Stats" button
- Privacy notice explains what data is sent to Anthropic

## Edge Cases & Gotchas

- **API key rotation:** Allow updating key without losing usage stats
- **Rate limiting:** Claude API has rate limits — implement exponential backoff
- **Network errors:** Gracefully fall back to local LLM if cloud request fails
- **Cost alerts:** Warn user if estimated cost exceeds threshold (e.g., $0.50)
- **Partial responses:** Handle streaming interruptions (network drop)
- **Long transcripts:** Claude has 200K token context — most recordings fit, but warn if >100K
- **Privacy:** Never log full API responses with user data — only metadata

## Performance Targets


| Metric                        | Target                                           |
| ----------------------------- | ------------------------------------------------ |
| **Summary generation time**   | <10s for 5K token transcript (Claude 3.5 Sonnet) |
| **Cost per summary**          | <$0.05 for typical 10-minute meeting             |
| **Token estimation accuracy** | ±10% of actual usage                             |


