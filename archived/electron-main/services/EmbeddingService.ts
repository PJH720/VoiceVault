import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'

type LlamaContextLike = {
  getEmbedding?: (text: string) => Promise<Float32Array>
}

type LlamaModelLike = Record<string, unknown>

type LlamaModule = {
  LlamaModel?: new (options: Record<string, unknown>) => LlamaModelLike
  LlamaContext?: new (options: Record<string, unknown>) => LlamaContextLike
}

export class EmbeddingService {
  private model: LlamaModelLike | null = null
  private context: LlamaContextLike | null = null
  private readonly modelPath: string
  private readonly fallbackDim = 384

  public constructor(modelName = 'nomic-embed-text-v1.5-Q8_0') {
    this.modelPath = path.join(app.getPath('userData'), 'models', 'embeddings', `${modelName}.gguf`)
  }

  public async initialize(): Promise<void> {
    if (this.context) return
    if (!(await this.isModelAvailable())) {
      return
    }
    try {
      const moduleName = 'node-llama-cpp'
      const llamaModule = (await import(/* @vite-ignore */ moduleName)) as unknown as LlamaModule
      if (!llamaModule.LlamaModel || !llamaModule.LlamaContext) return
      this.model = new llamaModule.LlamaModel({
        modelPath: this.modelPath,
        gpuLayers: process.platform === 'darwin' ? 'max' : 0
      })
      this.context = new llamaModule.LlamaContext({
        model: this.model,
        contextSize: 512,
        embedding: true
      })
    } catch {
      // embedding model failed to load
      this.context = null
      this.model = null
    }
  }

  public async embed(text: string): Promise<Float32Array> {
    const trimmed = text.trim()
    if (!trimmed) return new Float32Array(this.fallbackDim)
    await this.initialize()
    try {
      if (this.context?.getEmbedding) {
        const vec = await this.context.getEmbedding(trimmed)
        return this.normalize(vec)
      }
    } catch {
      // embedding generation failed, use fallback
      // fallback below
    }
    return this.fallbackEmbedding(trimmed)
  }

  public async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return Promise.all(texts.map((text) => this.embed(text)))
  }

  public async isModelAvailable(): Promise<boolean> {
    try {
      await fsp.access(this.modelPath, fs.constants.R_OK)
      return true
    } catch {
      // model file not accessible
      return false
    }
  }

  public destroy(): void {
    this.context = null
    this.model = null
  }

  private normalize(vec: Float32Array): Float32Array {
    let norm = 0
    for (let i = 0; i < vec.length; i += 1) {
      norm += vec[i] * vec[i]
    }
    const denom = Math.sqrt(norm) || 1
    const normalized = new Float32Array(vec.length)
    for (let i = 0; i < vec.length; i += 1) {
      normalized[i] = vec[i] / denom
    }
    return normalized
  }

  private fallbackEmbedding(text: string): Float32Array {
    const vec = new Float32Array(this.fallbackDim)
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i)
      const bucket = code % this.fallbackDim
      vec[bucket] += 1
    }
    return this.normalize(vec)
  }
}
