import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { unlink } from 'fs/promises'
import type { TranscriptSegment } from '../../../shared/types'
import { getUserDataPath } from '../../types'
import { resolveBinary, resolveModel, spawnEnv, downloadFile } from '../../utils/subprocess'

export interface WhisperTranscribeOptions {
  language?: string
  threads?: number
  translate?: boolean
  timeoutMs?: number
}

export interface WhisperTranscriptionMetrics {
  durationMs: number
  rssBeforeMb: number
  rssAfterMb: number
  rssPeakMb: number
  rssDeltaMb: number
}

export class WhisperSubprocess {
  private runningProc: ReturnType<typeof Bun.spawn> | null = null
  private readonly binaryName = 'whisper-cli'
  private warmedModelPaths = new Set<string>()
  private lastMetrics: WhisperTranscriptionMetrics | null = null

  // Build the whisper-cli arg list — shared by transcribeFile + streamTranscribe
  private buildArgs(modelPath: string, audioPath: string, opts: WhisperTranscribeOptions): string[] {
    const args = [
      resolveBinary(this.binaryName),
      '-m', resolveModel(modelPath),
      '-f', audioPath,
      '--output-json',
      '-t', String(opts.threads ?? 4),
      '-l', opts.language ?? 'auto',
    ]
    if (opts.translate) args.push('--translate')
    return args
  }

  async transcribeFile(
    audioPath: string,
    modelPath: string,
    options: WhisperTranscribeOptions = {},
  ): Promise<TranscriptSegment[]> {
    const startedAt = performance.now()
    const rssBeforeBytes = process.memoryUsage().rss
    let rssPeakBytes = rssBeforeBytes

    const proc = Bun.spawn(this.buildArgs(modelPath, audioPath, options), {
      stdout: 'pipe',
      stderr: 'pipe',
      env: spawnEnv(),
    })
    this.runningProc = proc
    const timeout = setTimeout(() => proc.kill(), options.timeoutMs ?? 120_000)
    const rssProbe = setInterval(() => {
      rssPeakBytes = Math.max(rssPeakBytes, process.memoryUsage().rss)
    }, 50)

    try {
      const stdout = await new Response(proc.stdout).text()
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        throw new Error(`whisper-cli exited ${exitCode}: ${stderr}`)
      }
      return parseJsonOutput(stdout)
    } finally {
      clearInterval(rssProbe)
      clearTimeout(timeout)
      const rssAfterBytes = process.memoryUsage().rss
      const durationMs = performance.now() - startedAt
      const toMb = (bytes: number) => Number((bytes / (1024 * 1024)).toFixed(1))
      this.lastMetrics = {
        durationMs: Number(durationMs.toFixed(1)),
        rssBeforeMb: toMb(rssBeforeBytes),
        rssAfterMb: toMb(rssAfterBytes),
        rssPeakMb: toMb(rssPeakBytes),
        rssDeltaMb: toMb(rssAfterBytes - rssBeforeBytes),
      }
      console.log('[WhisperMetrics]', JSON.stringify(this.lastMetrics))
      this.runningProc = null
    }
  }

  async streamTranscribe(
    audioPath: string,
    modelPath: string,
    onSegment: (segment: TranscriptSegment) => void,
    options: WhisperTranscribeOptions = {},
  ): Promise<void> {
    const proc = Bun.spawn(this.buildArgs(modelPath, audioPath, options), {
      stdout: 'pipe',
      stderr: 'pipe',
      env: spawnEnv(),
    })
    this.runningProc = proc

    // One decoder instance for the entire stream (not per-chunk)
    const decoder = new TextDecoder()
    const timeout = setTimeout(() => proc.kill(), 120_000)

    try {
      const reader = proc.stdout.getReader()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const p = JSON.parse(trimmed) as {
              text: string; start: number; end: number; language?: string; confidence?: number
            }
            onSegment({
              text: p.text,
              start: p.start,
              end: p.end,
              language: p.language ?? options.language ?? 'auto',
              confidence: p.confidence ?? 0.9,
            })
          } catch { /* skip non-JSON lines */ }
        }
      }

      await proc.exited
    } finally {
      clearTimeout(timeout)
      this.runningProc = null
    }
  }

  async downloadModel(modelName: string, onProgress?: (percent: number) => void): Promise<void> {
    const modelsDir = join(getUserDataPath(), 'models')
    const outputPath = join(modelsDir, `ggml-${modelName}.bin`)
    if (existsSync(outputPath)) { onProgress?.(100); return }

    mkdirSync(modelsDir, { recursive: true })
    const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${modelName}.bin`
    await downloadFile(url, outputPath, onProgress)
  }

  async getBinaryStatus(): Promise<{ available: boolean; path: string }> {
    const path = resolveBinary(this.binaryName)
    return { available: existsSync(path) || Bun.which(this.binaryName) !== null, path }
  }

  getLastMetrics(): WhisperTranscriptionMetrics | null {
    return this.lastMetrics
  }

  async prewarmModel(modelPath: string, options: WhisperTranscribeOptions = {}): Promise<void> {
    const resolvedModelPath = resolveModel(modelPath)
    if (this.warmedModelPaths.has(resolvedModelPath)) return

    const tempWav = join(getUserDataPath(), 'tmp', `whisper-prewarm-${Date.now()}.wav`)
    mkdirSync(join(getUserDataPath(), 'tmp'), { recursive: true })
    await Bun.write(tempWav, createSilentWav(0.4))

    try {
      await this.transcribeFile(tempWav, modelPath, {
        language: options.language ?? 'en',
        threads: options.threads ?? 2,
      })
      this.warmedModelPaths.add(resolvedModelPath)
    } finally {
      await unlink(tempWav).catch(() => undefined)
    }
  }

  abort(): void {
    this.runningProc?.kill()
    this.runningProc = null
  }
}

// ── JSON output parsing (module-level: no `this` dependency) ──────────────────

function parseJsonOutput(stdout: string): TranscriptSegment[] {
  // Try structured JSON first (whisper-cli --output-json full format)
  try {
    const parsed = JSON.parse(stdout) as {
      transcription?: Array<{ timestamps: { from: string; to: string }; text: string }>
    }
    if (parsed.transcription) {
      return parsed.transcription.map((item) => ({
        text: item.text.trim(),
        start: parseTimestamp(item.timestamps.from),
        end: parseTimestamp(item.timestamps.to),
        language: 'auto',
        confidence: 0.9,
      }))
    }
  } catch { /* fall through */ }

  // Fallback: one JSON object per line
  return stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const p = JSON.parse(line) as {
          text: string; start: number; end: number; language?: string; confidence?: number
        }
        return [{ text: p.text, start: p.start, end: p.end, language: p.language ?? 'auto', confidence: p.confidence ?? 0.9 }]
      } catch { return [] }
    })
}

function parseTimestamp(ts: string): number {
  // "HH:MM:SS,mmm" or "HH:MM:SS.mmm" → seconds
  const parts = ts.replace(',', '.').split(':')
  if (parts.length === 3) {
    return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2])
  }
  return Number(ts) || 0
}

function createSilentWav(durationSec: number, sampleRate = 16000): Uint8Array {
  const numSamples = Math.max(1, Math.floor(sampleRate * durationSec))
  const bytesPerSample = 2
  const numChannels = 1
  const pcmDataSize = numSamples * bytesPerSample * numChannels
  const totalSize = 44 + pcmDataSize
  const buffer = new ArrayBuffer(totalSize)
  const view = new DataView(buffer)
  const writeAscii = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }

  writeAscii(0, 'RIFF')
  view.setUint32(4, totalSize - 8, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true)
  view.setUint16(32, numChannels * bytesPerSample, true)
  view.setUint16(34, 16, true)
  writeAscii(36, 'data')
  view.setUint32(40, pcmDataSize, true)

  return new Uint8Array(buffer)
}
