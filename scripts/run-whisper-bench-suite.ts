/**
 * Run end-to-end Whisper benchmark suite:
 * 1) Ensure base/small models are downloaded
 * 2) Run sustained benchmark for each model
 * 3) Print comparison summary and persist JSON output
 *
 * Usage:
 *   bun scripts/run-whisper-bench-suite.ts
 *   bun scripts/run-whisper-bench-suite.ts --minutes 0.2 --threads 4
 */
import { existsSync, mkdirSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { setUserDataPath } from '../src/main/types'
import { WhisperSubprocess } from '../src/main/services/subprocess/WhisperSubprocess'

interface CliOptions {
  minutes: number
  threads: number
  audioPath?: string
  timeoutMs: number
}

interface BenchSummary {
  model: string
  minutes: number
  runs: number
  avgDurationMs: number
  avgRtf: number
  peakRssMb: number
  earlyAvgDurationMs: number
  lateAvgDurationMs: number
  slowdownPct: number
  generatedAt: string
}

const HOME = process.env.HOME ?? '/home/pj'
const USER_DATA = process.env.VOICEVAULT_USER_DATA_PATH ?? join(HOME, '.local/share/VoiceVault')
setUserDataPath(USER_DATA)

function parseArgs(argv: string[]): CliOptions {
  const get = (flag: string) => {
    const idx = argv.indexOf(flag)
    return idx >= 0 ? argv[idx + 1] : undefined
  }

  const minutes = Number(get('--minutes') ?? 5)
  const threads = Number(get('--threads') ?? 4)
  const audioPath = get('--audio')
  const timeoutMs = Number(get('--timeout-ms') ?? 300000)

  return {
    minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 5,
    threads: Number.isFinite(threads) && threads > 0 ? threads : 4,
    audioPath,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 300000,
  }
}

function formatTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

async function ensureModel(whisper: WhisperSubprocess, model: 'base' | 'small'): Promise<void> {
  const modelFile = join(USER_DATA, 'models', `ggml-${model}.bin`)
  if (existsSync(modelFile)) {
    console.log(`[Suite] model already present: ${modelFile}`)
    return
  }
  console.log(`[Suite] downloading model: ${model}`)
  let lastPercent = -1
  await whisper.downloadModel(model, (percent) => {
    if (percent % 10 === 0 && percent !== lastPercent) {
      console.log(`[Suite] ${model} download ${percent}%`)
      lastPercent = percent
    }
  })
  console.log(`[Suite] download complete: ${model}`)
}

async function runBench(
  model: 'base' | 'small',
  options: CliOptions,
  resultDir: string,
): Promise<BenchSummary> {
  const outputPath = join(resultDir, `whisper-bench-${model}-${formatTimestamp()}.json`)
  const args = [
    'scripts/bench-whisper-sustained.ts',
    '--model', model,
    '--minutes', String(options.minutes),
    '--threads', String(options.threads),
    '--timeout-ms', String(options.timeoutMs),
    '--output-json', outputPath,
  ]
  if (options.audioPath) args.push('--audio', options.audioPath)

  const proc = Bun.spawn(['bun', ...args], {
    cwd: process.cwd(),
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env,
  })

  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  process.stdout.write(stdout)
  if (stderr.trim()) process.stderr.write(stderr)
  if (exitCode !== 0) throw new Error(`Benchmark failed for ${model} (exit=${exitCode})`)

  const raw = await readFile(outputPath, 'utf8')
  const parsed = JSON.parse(raw) as BenchSummary
  return parsed
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const whisper = new WhisperSubprocess()
  const binary = await whisper.getBinaryStatus()
  if (!binary.available) throw new Error('whisper-cli not available in PATH')

  const resultDir = join(process.cwd(), 'docs', 'milestones', 'v0.6.0')
  mkdirSync(resultDir, { recursive: true })

  console.log(`[Suite] userData=${USER_DATA}`)
  console.log(`[Suite] options=${JSON.stringify(options)}`)

  await ensureModel(whisper, 'base')
  await ensureModel(whisper, 'small')

  const base = await runBench('base', options, resultDir)
  const small = await runBench('small', options, resultDir)

  const comparison = {
    executedAt: new Date().toISOString(),
    minutesPerModel: options.minutes,
    threads: options.threads,
    base,
    small,
    deltaAvgDurationMs: Number((small.avgDurationMs - base.avgDurationMs).toFixed(1)),
    deltaAvgRtf: Number((small.avgRtf - base.avgRtf).toFixed(3)),
    deltaPeakRssMb: Number((small.peakRssMb - base.peakRssMb).toFixed(1)),
    deltaSlowdownPct: Number((small.slowdownPct - base.slowdownPct).toFixed(2)),
  }

  const comparisonPath = join(resultDir, `whisper-bench-suite-${formatTimestamp()}.json`)
  await Bun.write(comparisonPath, JSON.stringify(comparison, null, 2))

  console.log('\n=== Whisper Benchmark Suite Summary ===')
  console.log(JSON.stringify(comparison, null, 2))
  console.log(`[Suite] saved: ${comparisonPath}`)
}

main().catch((err) => {
  console.error('[Suite] failed:', err)
  process.exit(1)
})
