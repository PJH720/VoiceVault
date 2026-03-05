import fs from 'node:fs'
import fsp from 'node:fs/promises'
import https from 'node:https'
import path from 'node:path'
import { app } from 'electron'
import type { LlmModelName, SummaryOutput } from '../../shared/types'
import { PromptService, type SummaryPromptType } from './PromptService'

type LlamaLike = {
  prompt: (text: string, options?: Record<string, unknown>) => Promise<void>
}

type LlamaContextLike = {
  dispose?: () => void
}

type LlamaModelLike = {
  dispose?: () => void
}

type LlamaModule = {
  LlamaModel?: new (options: Record<string, unknown>) => LlamaModelLike
  LlamaContext?: new (options: Record<string, unknown>) => LlamaContextLike
  LlamaChatSession?: new (options: Record<string, unknown>) => LlamaLike
}

const MODEL_URLS: Record<LlmModelName, string> = {
  'gemma-2-3n-instruct-q4_k_m':
    'https://huggingface.co/bartowski/gemma-2-3n-instruct-GGUF/resolve/main/gemma-2-3n-instruct-Q4_K_M.gguf',
  'llama-3.2-3b-instruct-q4_k_m':
    'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf'
}

export class LLMService {
  private model: LlamaModelLike | null = null
  private context: LlamaContextLike | null = null
  private session: LlamaLike | null = null
  private modelName: LlmModelName
  private readonly modelDir: string

  public constructor(modelName: LlmModelName) {
    this.modelName = modelName
    this.modelDir = path.join(app.getPath('userData'), 'models', 'llm')
  }

  public setModel(nextModel: LlmModelName): void {
    if (this.modelName === nextModel) return
    this.modelName = nextModel
    void this.unload()
  }

  public getModel(): LlmModelName {
    return this.modelName
  }

  public getModelPath(modelName: LlmModelName = this.modelName): string {
    return path.join(this.modelDir, `${modelName}.gguf`)
  }

  public async isModelAvailable(modelName: LlmModelName = this.modelName): Promise<boolean> {
    try {
      await fsp.access(this.getModelPath(modelName), fs.constants.R_OK)
      return true
    } catch {
      // model file not accessible
      return false
    }
  }

  public async initialize(): Promise<void> {
    if (this.session) return
    if (!(await this.isModelAvailable())) {
      throw new Error(`LLM model not found: ${this.modelName}`)
    }

    const moduleName = 'node-llama-cpp'
    const llamaModule = (await import(/* @vite-ignore */ moduleName)) as unknown as LlamaModule
    if (!llamaModule.LlamaModel || !llamaModule.LlamaContext || !llamaModule.LlamaChatSession) {
      throw new Error('node-llama-cpp exports not available')
    }

    this.model = new llamaModule.LlamaModel({
      modelPath: this.getModelPath(),
      gpuLayers: process.platform === 'darwin' ? 'max' : 0
    })
    this.context = new llamaModule.LlamaContext({
      model: this.model,
      contextSize: 8192
    })
    this.session = new llamaModule.LlamaChatSession({
      context: this.context
    })
  }

  public async summarize(
    transcript: string,
    type: SummaryPromptType,
    previousSummary: string,
    onToken?: (token: string) => void
  ): Promise<SummaryOutput> {
    const trimmed = transcript.trim()
    if (!trimmed) {
      return this.emptySummary()
    }

    const prompt =
      type === 'incremental'
        ? PromptService.incrementalSummary(previousSummary, trimmed)
        : PromptService.finalSummary(trimmed)

    let response = ''
    try {
      await this.initialize()
      if (!this.session) return this.fallbackSummary(trimmed, previousSummary, type)
      await this.session.prompt(prompt, {
        temperature: 0.6,
        topK: 40,
        topP: 0.9,
        maxTokens: 1024,
        onToken: (chunk: unknown) => {
          const token = String(chunk ?? '')
          response += token
          onToken?.(token)
        }
      })
      return this.parseStructuredOutput(response, trimmed, previousSummary, type)
    } catch {
      // LLM inference failed, use fallback summary
      return this.fallbackSummary(trimmed, previousSummary, type)
    }
  }

  public async answerQuestion(
    question: string,
    context: string,
    onToken?: (token: string) => void
  ): Promise<string> {
    const prompt = `Answer the question using only the context.
Include citation markers like [1], [2] where relevant.

Question:
${question}

Context:
${context}

Answer:`
    let response = ''
    try {
      await this.initialize()
      if (!this.session) return this.fallbackAnswer(context)
      await this.session.prompt(prompt, {
        temperature: 0.4,
        topK: 40,
        topP: 0.9,
        maxTokens: 512,
        onToken: (chunk: unknown) => {
          const token = String(chunk ?? '')
          response += token
          onToken?.(token)
        }
      })
      const trimmed = response.trim()
      return trimmed || this.fallbackAnswer(context)
    } catch {
      // LLM answer failed, use fallback
      return this.fallbackAnswer(context)
    }
  }

  public async downloadModel(
    modelName: LlmModelName = this.modelName,
    onProgress?: (percent: number, downloaded: number, total: number) => void
  ): Promise<string> {
    await fsp.mkdir(this.modelDir, { recursive: true })
    const targetPath = this.getModelPath(modelName)
    const tmpPath = `${targetPath}.download`
    const url = MODEL_URLS[modelName]

    await new Promise<void>((resolve, reject) => {
      const req = https.get(url, (res) => {
        if (!res.statusCode || res.statusCode >= 400) {
          reject(new Error(`Failed to download model (${res.statusCode ?? 'unknown'})`))
          return
        }
        const total = Number(res.headers['content-length'] ?? 0)
        let downloaded = 0
        const out = fs.createWriteStream(tmpPath)
        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length
          if (onProgress && total > 0) {
            onProgress(Math.round((downloaded / total) * 100), downloaded, total)
          }
        })
        res.on('error', (error) => {
          out.destroy()
          reject(error)
        })
        out.on('error', reject)
        out.on('finish', resolve)
        res.pipe(out)
      })
      req.on('error', reject)
    })

    await fsp.rename(tmpPath, targetPath)
    onProgress?.(100, 1, 1)
    return targetPath
  }

  public async unload(): Promise<void> {
    this.session = null
    this.context?.dispose?.()
    this.context = null
    this.model?.dispose?.()
    this.model = null
  }

  private parseStructuredOutput(
    response: string,
    transcript: string,
    previousSummary: string,
    type: SummaryPromptType
  ): SummaryOutput {
    try {
      const fenced = response.match(/```json\s*([\s\S]*?)\s*```/i)
      const inline = response.match(/\{[\s\S]*\}/)
      const jsonText = (fenced?.[1] ?? inline?.[0] ?? response).trim()
      const parsed = JSON.parse(jsonText) as Partial<SummaryOutput>
      return {
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
        discussionPoints: Array.isArray(parsed.discussionPoints) ? parsed.discussionPoints : [],
        keyStatements: Array.isArray(parsed.keyStatements) ? parsed.keyStatements : [],
        decisions: Array.isArray(parsed.decisions) ? parsed.decisions : []
      }
    } catch {
      // JSON parse of LLM output failed, use fallback
      return this.fallbackSummary(transcript, previousSummary, type)
    }
  }

  private fallbackSummary(
    transcript: string,
    previousSummary: string,
    type: SummaryPromptType
  ): SummaryOutput {
    const sentences = transcript
      .split(/[.!?\n]/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
    const summarySeed = sentences.slice(0, 2).join('. ')
    const mergedSummary =
      type === 'incremental' && previousSummary
        ? `${previousSummary} ${summarySeed}`.trim()
        : summarySeed || 'No summary available.'

    const decisions = sentences.filter((line) => /decid|결정|합의/i.test(line)).slice(0, 5)
    const actionItems = sentences
      .filter((line) => /todo|action|해야|할 일/i.test(line))
      .slice(0, 5)
      .map((task) => ({ task, priority: 'medium' as const }))

    return {
      summary: mergedSummary.slice(0, 500),
      actionItems,
      discussionPoints: sentences.slice(0, 6),
      keyStatements: sentences.slice(0, 3).map((text, index) => ({
        text,
        timestamp: index * 30
      })),
      decisions
    }
  }

  private emptySummary(): SummaryOutput {
    return {
      summary: '',
      actionItems: [],
      discussionPoints: [],
      keyStatements: [],
      decisions: []
    }
  }

  private fallbackAnswer(context: string): string {
    const lines = context
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => /^\[\d+\]/.test(line))
      .slice(0, 3)
    if (lines.length === 0) {
      return 'No grounded context found for this query.'
    }
    return `Based on retrieved context: ${lines.join(' ')}`
  }
}
