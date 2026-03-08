import { join } from 'path'
import { existsSync, statSync, mkdirSync } from 'fs'
import { getUserDataPath } from '../../types'
import { resolveBinary, resolveModel, spawnEnv } from '../../utils/subprocess'

export class LlmSubprocess {
  private runningProc: ReturnType<typeof Bun.spawn> | null = null
  private readonly binaryName = 'llama-cli'

  async streamCompletion(
    prompt: string,
    modelPath: string,
    onToken: (token: string) => void,
    options: {
      contextSize?: number
      temperature?: number
      maxTokens?: number
      signal?: AbortSignal
    } = {},
  ): Promise<string> {
    const args = [
      resolveBinary(this.binaryName),
      '-m', resolveModel(modelPath),
      '-p', prompt,
      '-c', String(options.contextSize ?? 4096),
      '--temp', String(options.temperature ?? 0.7),
      '-n', String(options.maxTokens ?? 1024),
      '--no-display-prompt',
    ]

    const proc = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe', env: spawnEnv() })
    this.runningProc = proc

    const timeout = setTimeout(() => proc.kill(), 300_000)
    options.signal?.addEventListener('abort', () => { proc.kill(); clearTimeout(timeout) })

    try {
      const reader = proc.stdout.getReader()
      const decoder = new TextDecoder()
      let fullOutput = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value, { stream: true })
        fullOutput += text
        onToken(text)
      }

      const exitCode = await proc.exited
      if (exitCode !== 0 && !options.signal?.aborted) {
        const stderr = await new Response(proc.stderr).text()
        throw new Error(`llama-cli exited ${exitCode}: ${stderr}`)
      }

      return fullOutput
    } finally {
      clearTimeout(timeout)
      this.runningProc = null
    }
  }

  async downloadModel(
    modelName: string,
    onProgress?: (percent: number, downloaded: number, total: number) => void,
  ): Promise<void> {
    const modelsDir = join(getUserDataPath(), 'models')
    const outputPath = join(modelsDir, `${modelName}.gguf`)

    if (existsSync(outputPath)) {
      const size = statSync(outputPath).size
      onProgress?.(100, size, size)
      return
    }

    mkdirSync(modelsDir, { recursive: true })
    const url = `https://huggingface.co/bartowski/${modelName}-GGUF/resolve/main/${modelName}.Q4_K_M.gguf`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Download failed (${res.status}): ${res.statusText}`)

    if (!onProgress) {
      // Fast path: no progress tracking needed
      await Bun.write(outputPath, res)
      return
    }

    // Progress path: stream through Bun.file writer
    const total = Number(res.headers.get('content-length') ?? 0)
    const writer = Bun.file(outputPath).writer()
    const reader = res.body!.getReader()
    let downloaded = 0

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        writer.write(value)
        downloaded += value.length
        if (total > 0) onProgress(Math.round((downloaded / total) * 100), downloaded, total)
      }
      await writer.end()
      onProgress(100, downloaded, downloaded)
    } catch (err) {
      await writer.end()
      throw err
    }
  }

  async getModelStatus(modelPath: string): Promise<{ loaded: boolean; size: number }> {
    const resolved = resolveModel(modelPath)
    if (!existsSync(resolved)) return { loaded: false, size: 0 }
    return { loaded: true, size: statSync(resolved).size }
  }

  unload(): void {
    this.runningProc?.kill()
    this.runningProc = null
  }
}
