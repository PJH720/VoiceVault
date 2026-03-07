import { join } from 'path'
import { existsSync } from 'fs'
import type { TranscriptSegment } from '../../../shared/types'
import { getUserDataPath } from '../../types'

export interface WhisperTranscribeOptions {
  language?: string
  threads?: number
  translate?: boolean
  outputFormat?: 'json' | 'srt' | 'txt'
}

export class WhisperSubprocess {
  private runningProc: ReturnType<typeof Bun.spawn> | null = null
  private readonly binaryName = 'whisper-cli'

  private getBinaryPath(): string {
    const candidates = [
      join(getUserDataPath(), 'bin', this.binaryName),
      '/home/linuxbrew/.linuxbrew/bin/' + this.binaryName,
      '/usr/local/bin/' + this.binaryName,
      '/opt/homebrew/bin/' + this.binaryName,
      '/usr/bin/' + this.binaryName,
      this.binaryName
    ]
    return candidates.find((p) => existsSync(p)) ?? this.binaryName
  }

  private getModelPath(modelPath: string): string {
    if (existsSync(modelPath)) return modelPath
    return join(getUserDataPath(), 'models', modelPath)
  }

  async transcribeFile(
    audioPath: string,
    modelPath: string,
    options: WhisperTranscribeOptions = {}
  ): Promise<TranscriptSegment[]> {
    const resolvedModel = this.getModelPath(modelPath)
    const args = [
      this.getBinaryPath(),
      '-m', resolvedModel,
      '-f', audioPath,
      '--output-json',
      '-t', String(options.threads ?? 4),
      '-l', options.language ?? 'auto'
    ]

    if (options.translate) {
      args.push('--translate')
    }

    const proc = Bun.spawn(args, {
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        PATH: [
          process.env.PATH,
          '/home/linuxbrew/.linuxbrew/bin',
          '/usr/local/bin',
          '/opt/homebrew/bin'
        ].filter(Boolean).join(':')
      }
    })

    this.runningProc = proc

    const timeoutId = setTimeout(() => {
      proc.kill()
    }, 120_000)

    try {
      const stdout = await new Response(proc.stdout).text()
      const exitCode = await proc.exited
      clearTimeout(timeoutId)
      this.runningProc = null

      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        throw new Error(`whisper-cli exited with code ${exitCode}: ${stderr}`)
      }

      return this.parseJsonOutput(stdout)
    } catch (error) {
      clearTimeout(timeoutId)
      this.runningProc = null
      throw error
    }
  }

  async streamTranscribe(
    audioPath: string,
    modelPath: string,
    onSegment: (segment: TranscriptSegment) => void,
    options: WhisperTranscribeOptions = {}
  ): Promise<void> {
    const resolvedModel = this.getModelPath(modelPath)
    const args = [
      this.getBinaryPath(),
      '-m', resolvedModel,
      '-f', audioPath,
      '--output-json',
      '-t', String(options.threads ?? 4),
      '-l', options.language ?? 'auto'
    ]

    const proc = Bun.spawn(args, {
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        PATH: [
          process.env.PATH,
          '/home/linuxbrew/.linuxbrew/bin',
          '/usr/local/bin',
          '/opt/homebrew/bin'
        ].filter(Boolean).join(':')
      }
    })

    this.runningProc = proc

    const timeoutId = setTimeout(() => {
      proc.kill()
    }, 120_000)

    try {
      const reader = proc.stdout.getReader()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += new TextDecoder().decode(value)

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const parsed = JSON.parse(trimmed) as {
              text: string
              start: number
              end: number
              language?: string
              confidence?: number
            }
            const segment: TranscriptSegment = {
              text: parsed.text,
              start: parsed.start,
              end: parsed.end,
              language: parsed.language ?? options.language ?? 'auto',
              confidence: parsed.confidence ?? 0.9
            }
            onSegment(segment)
          } catch {
            // skip non-JSON lines
          }
        }
      }

      clearTimeout(timeoutId)
      await proc.exited
      this.runningProc = null
    } catch (error) {
      clearTimeout(timeoutId)
      this.runningProc = null
      throw error
    }
  }

  async downloadModel(
    modelName: string,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    const modelsDir = join(getUserDataPath(), 'models')
    const outputPath = join(modelsDir, `ggml-${modelName}.bin`)

    if (existsSync(outputPath)) {
      onProgress?.(100)
      return
    }

    const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${modelName}.bin`

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to download model: ${response.statusText}`)
    }

    const contentLength = Number(response.headers.get('content-length') ?? 0)
    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const { mkdirSync, writeFileSync } = await import('fs')
    mkdirSync(modelsDir, { recursive: true })

    const chunks: Uint8Array[] = []
    let downloaded = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      downloaded += value.length
      if (contentLength > 0) {
        onProgress?.(Math.round((downloaded / contentLength) * 100))
      }
    }

    const combined = new Uint8Array(downloaded)
    let offset = 0
    for (const chunk of chunks) {
      combined.set(chunk, offset)
      offset += chunk.length
    }

    writeFileSync(outputPath, combined)
    onProgress?.(100)
  }

  async getBinaryStatus(): Promise<{ available: boolean; path: string }> {
    const binaryPath = this.getBinaryPath()
    const available = existsSync(binaryPath) || Bun.which(binaryPath) !== null
    return { available, path: binaryPath }
  }

  abort(): void {
    this.runningProc?.kill()
    this.runningProc = null
  }

  private parseJsonOutput(stdout: string): TranscriptSegment[] {
    try {
      const parsed = JSON.parse(stdout) as {
        transcription?: Array<{
          timestamps: { from: string; to: string }
          text: string
        }>
      }
      if (parsed.transcription) {
        return parsed.transcription.map((item) => ({
          text: item.text.trim(),
          start: this.parseTimestamp(item.timestamps.from),
          end: this.parseTimestamp(item.timestamps.to),
          language: 'auto',
          confidence: 0.9
        }))
      }
    } catch {
      // Try line-by-line JSON
    }

    const segments: TranscriptSegment[] = []
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const parsed = JSON.parse(trimmed) as {
          text: string
          start: number
          end: number
          language?: string
          confidence?: number
        }
        segments.push({
          text: parsed.text,
          start: parsed.start,
          end: parsed.end,
          language: parsed.language ?? 'auto',
          confidence: parsed.confidence ?? 0.9
        })
      } catch {
        // skip
      }
    }
    return segments
  }

  private parseTimestamp(ts: string): number {
    // "HH:MM:SS,mmm" or "HH:MM:SS.mmm" -> seconds
    const parts = ts.replace(',', '.').split(':')
    if (parts.length === 3) {
      const hours = Number(parts[0])
      const minutes = Number(parts[1])
      const seconds = Number(parts[2])
      return hours * 3600 + minutes * 60 + seconds
    }
    return Number(ts) || 0
  }
}
