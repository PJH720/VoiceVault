/**
 * Sustained Whisper benchmark for thermal throttling detection.
 *
 * Usage:
 *   bun scripts/bench-whisper-sustained.ts --model base --minutes 5 --audio /path/to.wav
 */
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { setUserDataPath } from '../src/main/types'
import { WhisperSubprocess } from '../src/main/services/subprocess/WhisperSubprocess'

interface CliOptions {
  model: string
  minutes: number
  audioPath?: string
  threads: number
  outputJson?: string
  timeoutMs: number
}

interface IterationResult {
  run: number
  durationMs: number
  rtf: number
  rssBeforeMb: number
  rssAfterMb: number
  rssPeakMb: number
  rssDeltaMb: number
}

const HOME = process.env.HOME ?? '/home/pj'
const USER_DATA = join(HOME, '.local/share/VoiceVault')
setUserDataPath(USER_DATA)

function parseArgs(argv: string[]): CliOptions {
  const get = (flag: string) => {
    const idx = argv.indexOf(flag)
    return idx >= 0 ? argv[idx + 1] : undefined
  }
  const model = get('--model') ?? 'base'
  const minutes = Number(get('--minutes') ?? 5)
  const audioPath = get('--audio')
  const threads = Number(get('--threads') ?? 4)
  const outputJson = get('--output-json')
  const timeoutMs = Number(get('--timeout-ms') ?? 300000)
  return {
    model,
    minutes: Number.isFinite(minutes) ? minutes : 5,
    audioPath,
    threads,
    outputJson,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 300000,
  }
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

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((acc, v) => acc + v, 0) / values.length
}

async function resolveAudioPath(audioPath?: string): Promise<{ path: string; durationSec: number }> {
  if (audioPath) return { path: audioPath, durationSec: 5 }

  const tempDir = join(USER_DATA, 'tmp')
  mkdirSync(tempDir, { recursive: true })
  const tempWav = join(tempDir, 'whisper-bench-5s.wav')
  if (!existsSync(tempWav)) {
    await Bun.write(tempWav, createSilentWav(5))
  }
  return { path: tempWav, durationSec: 5 }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const whisper = new WhisperSubprocess()
  const modelPath = `ggml-${options.model}.bin`
  const modelFile = join(USER_DATA, 'models', modelPath)
  if (!existsSync(modelFile)) {
    throw new Error(`Model not found: ${modelFile}`)
  }

  const status = await whisper.getBinaryStatus()
  if (!status.available) throw new Error('whisper-cli not available in PATH')

  const { path: audioPath, durationSec } = await resolveAudioPath(options.audioPath)
  const startedAt = Date.now()
  const endAt = startedAt + options.minutes * 60_000
  const rows: IterationResult[] = []

  console.log(`Starting sustained benchmark: model=${options.model}, minutes=${options.minutes}, audio=${audioPath}`)

  while (Date.now() < endAt) {
    const run = rows.length + 1
    await whisper.transcribeFile(audioPath, modelPath, {
      threads: options.threads,
      language: 'en',
      timeoutMs: options.timeoutMs,
    })
    const metrics = whisper.getLastMetrics()
    if (!metrics) continue

    const rtf = Number((metrics.durationMs / (durationSec * 1000)).toFixed(3))
    const row: IterationResult = {
      run,
      durationMs: metrics.durationMs,
      rtf,
      rssBeforeMb: metrics.rssBeforeMb,
      rssAfterMb: metrics.rssAfterMb,
      rssPeakMb: metrics.rssPeakMb,
      rssDeltaMb: metrics.rssDeltaMb,
    }
    rows.push(row)
    console.log(JSON.stringify(row))
  }

  if (rows.length < 1) throw new Error('Not enough benchmark samples collected')

  const half = Math.max(1, Math.floor(rows.length / 2))
  const firstHalf = rows.slice(0, half)
  const secondHalf = rows.slice(-half)
  const earlyAvg = average(firstHalf.map((r) => r.durationMs))
  const lateAvg = average(secondHalf.map((r) => r.durationMs))
  const slowdownPct = earlyAvg > 0 ? Number((((lateAvg - earlyAvg) / earlyAvg) * 100).toFixed(2)) : 0
  const summary = {
    model: options.model,
    minutes: options.minutes,
    runs: rows.length,
    avgDurationMs: Number(average(rows.map((r) => r.durationMs)).toFixed(1)),
    avgRtf: Number(average(rows.map((r) => r.rtf)).toFixed(3)),
    peakRssMb: Number(Math.max(...rows.map((r) => r.rssPeakMb)).toFixed(1)),
    earlyAvgDurationMs: Number(earlyAvg.toFixed(1)),
    lateAvgDurationMs: Number(lateAvg.toFixed(1)),
    slowdownPct,
    generatedAt: new Date().toISOString(),
  }

  console.log('\n=== Sustained Benchmark Summary ===')
  console.log(JSON.stringify(summary, null, 2))
  if (options.outputJson) {
    await Bun.write(options.outputJson, JSON.stringify(summary, null, 2))
    console.log(`[bench] summary written: ${options.outputJson}`)
  }
}

main().catch((err) => {
  console.error('Benchmark failed:', err)
  process.exit(1)
})
