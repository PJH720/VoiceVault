import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import type { TranscriptSegment } from '../../../shared/types'
import { getUserDataPath } from '../../types'
import { resolveBinary, resolveModel, spawnEnv, downloadFile } from '../../utils/subprocess'

export interface WhisperTranscribeOptions {
  language?: string
  threads?: number
  translate?: boolean
}

export class WhisperSubprocess {
  private runningProc: ReturnType<typeof Bun.spawn> | null = null
  private readonly binaryName = 'whisper-cli'

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
    const proc = Bun.spawn(this.buildArgs(modelPath, audioPath, options), {
      stdout: 'pipe',
      stderr: 'pipe',
      env: spawnEnv(),
    })
    this.runningProc = proc
    const timeout = setTimeout(() => proc.kill(), 120_000)

    try {
      const stdout = await new Response(proc.stdout).text()
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        throw new Error(`whisper-cli exited ${exitCode}: ${stderr}`)
      }
      return parseJsonOutput(stdout)
    } finally {
      clearTimeout(timeout)
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
