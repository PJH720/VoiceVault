import fs from 'node:fs'
import fsp from 'node:fs/promises'
import https from 'node:https'
import path from 'node:path'
import { app } from 'electron'
import type { TranscriptSegment, WhisperModelSize } from '../../shared/types'

type WhisperLike = {
  transcribe: (audio: Float32Array, options?: Record<string, unknown>) => Promise<unknown>
  destroy?: () => void
}

type WhisperModule = {
  Whisper?: new (options: Record<string, unknown>) => WhisperLike
  default?: new (options: Record<string, unknown>) => WhisperLike
}

const MODEL_BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main'
const MODEL_LIST: WhisperModelSize[] = ['base', 'small', 'medium', 'large-v3-turbo']
const TARGET_SAMPLE_RATE = 16000

export class WhisperService {
  private whisper: WhisperLike | null = null
  private modelSize: WhisperModelSize
  private readonly modelRoot: string
  private readonly pcmWindow: number[] = []
  private segmentIndex = 0

  public constructor(initialModelSize: WhisperModelSize) {
    this.modelSize = initialModelSize
    this.modelRoot = path.join(app.getPath('userData'), 'models', 'whisper')
  }

  public setModelSize(next: WhisperModelSize): void {
    if (this.modelSize === next) return
    this.modelSize = next
    this.destroy()
  }

  public getModelSize(): WhisperModelSize {
    return this.modelSize
  }

  public listSupportedModels(): WhisperModelSize[] {
    return MODEL_LIST
  }

  public getModelPath(modelSize: WhisperModelSize = this.modelSize): string {
    return path.join(this.modelRoot, `ggml-${modelSize}.bin`)
  }

  public async isModelAvailable(modelSize: WhisperModelSize = this.modelSize): Promise<boolean> {
    try {
      await fsp.access(this.getModelPath(modelSize), fs.constants.R_OK)
      return true
    } catch {
      return false
    }
  }

  public async initialize(): Promise<void> {
    if (this.whisper) return
    if (!(await this.isModelAvailable())) {
      throw new Error(`Whisper model not found: ${this.modelSize}`)
    }

    const moduleName = 'whisper-cpp-node'
    const whisperModule = (await import(/* @vite-ignore */ moduleName)) as unknown as WhisperModule
    const WhisperCtor = whisperModule.Whisper ?? whisperModule.default
    if (!WhisperCtor) {
      throw new Error('Whisper constructor not found in whisper-cpp-node')
    }

    this.whisper = new WhisperCtor({
      modelPath: this.getModelPath(),
      coreMLEnabled: process.platform === 'darwin',
      language: 'auto',
      translate: false,
      splitOnWord: true,
      maxLen: 1
    })
  }

  public async downloadModel(
    modelSize: WhisperModelSize = this.modelSize,
    onProgress?: (percent: number) => void
  ): Promise<string> {
    const targetPath = this.getModelPath(modelSize)
    await fsp.mkdir(path.dirname(targetPath), { recursive: true })
    const tmpPath = `${targetPath}.download`
    const modelUrl = `${MODEL_BASE_URL}/ggml-${modelSize}.bin`

    await new Promise<void>((resolve, reject) => {
      const request = https.get(modelUrl, (response) => {
        if (!response.statusCode || response.statusCode >= 400) {
          reject(new Error(`Failed to download model (${response.statusCode ?? 'unknown'})`))
          return
        }
        const total = Number(response.headers['content-length'] ?? 0)
        let downloaded = 0
        const out = fs.createWriteStream(tmpPath)

        response.on('data', (chunk: Buffer) => {
          downloaded += chunk.length
          if (onProgress && total > 0) {
            onProgress(Math.min(100, Math.round((downloaded / total) * 100)))
          }
        })

        response.on('error', (error) => {
          out.destroy()
          reject(error)
        })
        out.on('error', reject)
        out.on('finish', resolve)
        response.pipe(out)
      })

      request.on('error', reject)
    })

    await fsp.rename(tmpPath, targetPath)
    if (onProgress) onProgress(100)
    return targetPath
  }

  public async transcribeChunk(
    pcmS16leChunk: Buffer,
    sampleRate: number,
    startedAtMs: number
  ): Promise<TranscriptSegment[]> {
    const floatChunk = this.toFloat32Pcm(pcmS16leChunk)
    if (sampleRate !== TARGET_SAMPLE_RATE) {
      const ratio = TARGET_SAMPLE_RATE / sampleRate
      this.pcmWindow.push(...this.resampleLinear(floatChunk, ratio))
    } else {
      this.pcmWindow.push(...floatChunk)
    }

    const minWindow = TARGET_SAMPLE_RATE * 2
    if (this.pcmWindow.length < minWindow) {
      return []
    }

    const frame = new Float32Array(this.pcmWindow.splice(0, minWindow))
    try {
      await this.initialize()
      if (!this.whisper) return []
      const result = await this.whisper.transcribe(frame, {
        sampleRate: TARGET_SAMPLE_RATE,
        temperature: 0,
        beamSize: 5
      })
      return this.parseSegments(result, startedAtMs)
    } catch {
      return this.fallbackSegment(frame, startedAtMs)
    }
  }

  public destroy(): void {
    this.whisper?.destroy?.()
    this.whisper = null
    this.pcmWindow.length = 0
    this.segmentIndex = 0
  }

  private parseSegments(raw: unknown, startedAtMs: number): TranscriptSegment[] {
    const result = raw as {
      language?: string
      segments?: Array<{
        text?: string
        confidence?: number
        startTime?: number
        endTime?: number
        words?: Array<{ word?: string; start?: number; end?: number }>
      }>
    }
    if (!result.segments || result.segments.length === 0) {
      return []
    }

    return result.segments
      .map((segment): TranscriptSegment | null => {
        const text = (segment.text ?? '').trim()
        if (!text) return null
        const start = Number(segment.startTime ?? 0)
        const end = Number(segment.endTime ?? start + 1)
        return {
          text,
          start: Math.max(0, start),
          end: Math.max(start, end),
          language: (result.language ?? 'auto').toLowerCase(),
          confidence: Number(segment.confidence ?? 0.5),
          words: Array.isArray(segment.words)
            ? segment.words
                .filter((word) => word.word && Number.isFinite(word.start) && Number.isFinite(word.end))
                .map((word) => ({
                  word: String(word.word),
                  start: Number(word.start),
                  end: Number(word.end)
                }))
            : undefined
        }
      })
      .filter((segment): segment is TranscriptSegment => segment !== null)
      .map((segment) => this.withMonotonicTimeline(segment, startedAtMs))
  }

  private fallbackSegment(frame: Float32Array, startedAtMs: number): TranscriptSegment[] {
    let energy = 0
    for (const sample of frame) energy += sample * sample
    const rms = Math.sqrt(energy / Math.max(1, frame.length))
    if (rms < 0.02) return []
    const elapsedSec = Math.max(0, (Date.now() - startedAtMs) / 1000)
    const start = Math.max(0, elapsedSec - 2)
    const end = Math.max(start + 0.2, elapsedSec)

    return [
      this.withMonotonicTimeline(
        {
          text: '[speech detected]',
          start,
          end,
          language: 'auto',
          confidence: Math.min(0.99, Math.max(0.35, rms))
        },
        startedAtMs
      )
    ]
  }

  private withMonotonicTimeline(segment: TranscriptSegment, _startedAtMs: number): TranscriptSegment {
    const bump = this.segmentIndex * 0.001
    this.segmentIndex += 1
    const start = Number((segment.start + bump).toFixed(3))
    const end = Number((Math.max(start + 0.1, segment.end + bump)).toFixed(3))
    return { ...segment, start, end }
  }

  private toFloat32Pcm(buffer: Buffer): Float32Array {
    const size = Math.floor(buffer.length / 2)
    const samples = new Float32Array(size)
    for (let i = 0; i < size; i += 1) {
      samples[i] = buffer.readInt16LE(i * 2) / 32768
    }
    return samples
  }

  private resampleLinear(input: Float32Array, ratio: number): number[] {
    if (!Number.isFinite(ratio) || ratio <= 0) return []
    const outLength = Math.max(1, Math.floor(input.length * ratio))
    const out: number[] = new Array(outLength)
    for (let i = 0; i < outLength; i += 1) {
      const sourcePos = i / ratio
      const left = Math.floor(sourcePos)
      const right = Math.min(input.length - 1, left + 1)
      const mix = sourcePos - left
      const sample = input[left] * (1 - mix) + input[right] * mix
      out[i] = sample
    }
    return out
  }
}
