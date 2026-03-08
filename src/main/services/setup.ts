/**
 * setup.ts — First-Run Binary Verification & Bootstrap
 *
 * Called once at app startup (main.ts) after the DB is initialized.
 * Verifies that the required AI binaries (whisper-cli, llama-cli) are
 * available via the resolveBinary() search path, and that at least one
 * Whisper model is present.
 *
 * If anything is missing, the result object tells the renderer what's
 * needed so the UI can show a guided first-run setup screen.
 *
 * Binary search order (from resolveBinary() in utils/subprocess.ts):
 *   1. ~/.local/share/VoiceVault/bin/   (bundled in installer, or manually placed)
 *   2. /home/linuxbrew/.linuxbrew/bin/  (Linuxbrew)
 *   3. /usr/local/bin/                  (Homebrew on macOS)
 *   4. $PATH fallback
 *
 * Model search path (from resolveModel() in utils/subprocess.ts):
 *   ~/.voicevault/models/ggml-<size>.bin
 */

import { join } from 'path'
import { existsSync } from 'fs'
import { resolveBinary, resolveModel, downloadFile } from '../utils/subprocess'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SetupStatus {
  /** true if all required components are present and the app can start normally */
  ready: boolean
  whisperCli: BinaryStatus
  llamaCli: BinaryStatus
  whisperModel: ModelStatus
}

interface BinaryStatus {
  found: boolean
  path: string | null
  downloadUrl: string | null
}

interface ModelStatus {
  found: boolean
  path: string | null
  /** Recommended model to download if missing */
  recommendedSize: 'tiny.en' | 'base.en' | 'small.en'
  downloadUrl: string | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WHISPER_MODEL_URLS: Record<string, string> = {
  'tiny.en': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
  'base.en': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
  'small.en': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',
}

// Pre-built static whisper-cli binary for Linux x64 (bundled with installer)
// This URL would point to a GitHub Release asset when CI is set up.
const STATIC_BINARY_DOWNLOAD_BASE =
  'https://github.com/PJH720/VoiceVault/releases/latest/download'

// ---------------------------------------------------------------------------
// Setup check
// ---------------------------------------------------------------------------

/**
 * Run at startup. Returns the current setup status without blocking the
 * app from starting — the renderer decides how to surface missing components.
 */
export async function checkSetup(): Promise<SetupStatus> {
  const whisperCli = checkBinary('whisper-cli')
  const llamaCli = checkBinary('llama-cli')
  const whisperModel = checkWhisperModel()

  const ready = whisperCli.found && whisperModel.found
  // llama-cli is optional — app degrades gracefully to cloud LLM if absent

  return { ready, whisperCli, llamaCli, whisperModel }
}

function checkBinary(name: string): BinaryStatus {
  try {
    const path = resolveBinary(name)
    return { found: true, path, downloadUrl: null }
  } catch {
    return {
      found: false,
      path: null,
      downloadUrl: `${STATIC_BINARY_DOWNLOAD_BASE}/${name}-linux-x64`,
    }
  }
}

function checkWhisperModel(): ModelStatus {
  const sizes = ['tiny.en', 'base.en', 'small.en'] as const
  for (const size of sizes) {
    try {
      const path = resolveModel(`ggml-${size}`)
      return { found: true, path, recommendedSize: 'tiny.en', downloadUrl: null }
    } catch {
      // continue to next size
    }
  }

  return {
    found: false,
    path: null,
    recommendedSize: 'tiny.en',
    downloadUrl: WHISPER_MODEL_URLS['tiny.en']!,
  }
}

// ---------------------------------------------------------------------------
// First-run download helpers (called via RPC from renderer setup screen)
// ---------------------------------------------------------------------------

/**
 * Download a Whisper model. Progress is reported via onProgress callback.
 * The model is saved to ~/.voicevault/models/ggml-<size>.bin.
 */
export async function downloadWhisperModel(
  size: 'tiny.en' | 'base.en' | 'small.en',
  onProgress?: (percent: number) => void,
): Promise<string> {
  const url = WHISPER_MODEL_URLS[size]
  if (!url) throw new Error(`Unknown Whisper model size: ${size}`)

  const home = process.env['HOME'] ?? '/tmp'
  const destDir = join(home, '.voicevault', 'models')
  const destPath = join(destDir, `ggml-${size}.bin`)

  await downloadFile(url, destPath, onProgress)
  return destPath
}

/**
 * Verify a binary is executable. Returns its resolved path or throws.
 */
export function verifyBinary(name: string): string {
  return resolveBinary(name)
}
