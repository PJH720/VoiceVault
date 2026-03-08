/**
 * Shared utilities for Bun.spawn subprocess management.
 *
 * Centralises: binary resolution, PATH augmentation, model path lookup,
 * and file download logic. Both WhisperSubprocess and LlmSubprocess import
 * from here — change once, fixed everywhere.
 */
import { join } from 'path'
import { existsSync } from 'fs'
import { getUserDataPath } from '../types'

// Extra PATH entries searched in order after the user-data bin dir.
const EXTRA_PATHS = [
  '/home/linuxbrew/.linuxbrew/bin',
  '/usr/local/bin',
  '/opt/homebrew/bin',
]

/**
 * Returns a copy of process.env with Linuxbrew and standard locations
 * prepended to PATH so that spawned subprocesses find shared libs.
 */
export function spawnEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: [process.env.PATH, ...EXTRA_PATHS].filter(Boolean).join(':'),
  }
}

/**
 * Resolves a binary name to an absolute path.
 * Search order: ~/.voicevault/bin/ → Linuxbrew → /usr/local → /opt/homebrew → $PATH fallback
 */
export function resolveBinary(name: string): string {
  const userBin = join(getUserDataPath(), 'bin', name)
  const candidates = [userBin, ...EXTRA_PATHS.map((p) => join(p, name))]
  return candidates.find((p) => existsSync(p)) ?? name
}

/**
 * Resolves a model filename to an absolute path.
 * Returns the path as-is if it already exists on disk;
 * otherwise looks in ~/.voicevault/models/.
 */
export function resolveModel(modelPath: string): string {
  if (existsSync(modelPath)) return modelPath
  return join(getUserDataPath(), 'models', modelPath)
}

/**
 * Downloads a URL to a local file.
 *
 * Fast path (no progress callback): delegates entirely to `Bun.write(path, response)`.
 * Progress path: streams through `Bun.file(path).writer()`, reporting percentage.
 *
 * @param url         - Source URL
 * @param outputPath  - Destination file path (parent dir must already exist)
 * @param onProgress  - Optional callback receiving 0–100 percentage
 */
export async function downloadFile(
  url: string,
  outputPath: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${res.statusText}`)

  if (!onProgress) {
    await Bun.write(outputPath, res)
    return
  }

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
      if (total > 0) onProgress(Math.round((downloaded / total) * 100))
    }
    await writer.end()
    onProgress(100)
  } catch (err) {
    await writer.end()
    throw err
  }
}
