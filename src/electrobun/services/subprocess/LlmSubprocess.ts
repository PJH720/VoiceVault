import { join } from 'path'
import { existsSync, statSync, mkdirSync } from 'fs'
import { getUserDataPath } from '../../types'

export class LlmSubprocess {
  private runningProc: ReturnType<typeof Bun.spawn> | null = null
  private readonly binaryName = 'llama-cli'

  private getBinaryPath(): string {
    const candidates = [
      join(getUserDataPath(), 'bin', this.binaryName),
      join('/usr/local/bin', this.binaryName),
      this.binaryName
    ]
    return candidates.find((p) => existsSync(p)) ?? this.binaryName
  }

  private getModelPath(modelPath: string): string {
    if (existsSync(modelPath)) return modelPath
    return join(getUserDataPath(), 'models', modelPath)
  }

  async streamCompletion(
    prompt: string,
    modelPath: string,
    onToken: (token: string) => void,
    options: {
      contextSize?: number
      temperature?: number
      maxTokens?: number
      signal?: AbortSignal
    } = {}
  ): Promise<string> {
    const resolvedModel = this.getModelPath(modelPath)
    const args = [
      this.getBinaryPath(),
      '-m', resolvedModel,
      '-p', prompt,
      '-c', String(options.contextSize ?? 4096),
      '--temp', String(options.temperature ?? 0.7),
      '-n', String(options.maxTokens ?? 1024),
      '--no-display-prompt'
    ]

    const proc = Bun.spawn(args, {
      stdout: 'pipe',
      stderr: 'pipe'
    })

    this.runningProc = proc

    const timeoutId = setTimeout(() => {
      proc.kill()
    }, 300_000)

    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        proc.kill()
        clearTimeout(timeoutId)
      })
    }

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

      clearTimeout(timeoutId)
      const exitCode = await proc.exited
      this.runningProc = null

      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        throw new Error(`llama-cli exited with code ${exitCode}: ${stderr}`)
      }

      return fullOutput
    } catch (error) {
      clearTimeout(timeoutId)
      this.runningProc = null
      throw error
    }
  }

  async downloadModel(
    modelName: string,
    onProgress?: (percent: number, downloaded: number, total: number) => void
  ): Promise<void> {
    const modelsDir = join(getUserDataPath(), 'models')
    const outputPath = join(modelsDir, `${modelName}.gguf`)

    if (existsSync(outputPath)) {
      const size = statSync(outputPath).size
      onProgress?.(100, size, size)
      return
    }

    // HuggingFace URL pattern for GGUF models
    const url = `https://huggingface.co/bartowski/${modelName}-GGUF/resolve/main/${modelName}.Q4_K_M.gguf`

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to download model: ${response.statusText}`)
    }

    const contentLength = Number(response.headers.get('content-length') ?? 0)
    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    mkdirSync(modelsDir, { recursive: true })

    const chunks: Uint8Array[] = []
    let downloaded = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      downloaded += value.length
      if (contentLength > 0) {
        onProgress?.(Math.round((downloaded / contentLength) * 100), downloaded, contentLength)
      }
    }

    const combined = new Uint8Array(downloaded)
    let offset = 0
    for (const chunk of chunks) {
      combined.set(chunk, offset)
      offset += chunk.length
    }

    const { writeFileSync } = await import('fs')
    writeFileSync(outputPath, combined)
    onProgress?.(100, downloaded, downloaded)
  }

  async getModelStatus(modelPath: string): Promise<{ loaded: boolean; size: number }> {
    const resolved = this.getModelPath(modelPath)
    if (!existsSync(resolved)) {
      return { loaded: false, size: 0 }
    }
    const size = statSync(resolved).size
    return { loaded: true, size }
  }

  unload(): void {
    this.runningProc?.kill()
    this.runningProc = null
  }
}
