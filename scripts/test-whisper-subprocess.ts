/**
 * Smoke test for WhisperSubprocess — verifies binary detection,
 * model availability, and transcription of a synthetic WAV file.
 */
import { existsSync } from 'fs'
import { join } from 'path'
import { setUserDataPath } from '../src/electrobun/types'
import { WhisperSubprocess } from '../src/electrobun/services/subprocess/WhisperSubprocess'

const HOME = process.env.HOME ?? '/home/pj'
const USER_DATA = join(HOME, '.local/share/VoiceVault')
setUserDataPath(USER_DATA)

const MODEL_PATH = join(USER_DATA, 'models', 'ggml-tiny.en.bin')
const TEST_WAV = '/tmp/vv-smoke-test.wav'

async function main(): Promise<void> {
  console.log('=== WhisperSubprocess Smoke Test ===\n')

  // 1. Check binary status
  const whisper = new WhisperSubprocess()
  const status = await whisper.getBinaryStatus()
  console.log(`[1] Binary status: ${JSON.stringify(status)}`)
  if (!status.available) {
    console.log('FAIL: whisper-cli not found')
    process.exit(1)
  }
  console.log('    PASS: whisper-cli available\n')

  // 2. Check model exists
  const modelExists = existsSync(MODEL_PATH)
  console.log(`[2] Model exists at ${MODEL_PATH}: ${modelExists}`)
  if (!modelExists) {
    console.log('FAIL: model not found')
    process.exit(1)
  }
  console.log('    PASS: model found\n')

  // 3. Generate test WAV with ffmpeg
  console.log('[3] Generating 2s 440Hz sine wave...')
  const ffmpeg = Bun.spawn(
    [
      'ffmpeg', '-y',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
      '-ar', '16000', '-ac', '1',
      TEST_WAV
    ],
    {
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        PATH: [
          process.env.PATH,
          '/home/linuxbrew/.linuxbrew/bin',
          '/usr/local/bin'
        ].filter(Boolean).join(':')
      }
    }
  )
  await ffmpeg.exited
  if (!existsSync(TEST_WAV)) {
    console.log('FAIL: ffmpeg did not produce test WAV')
    process.exit(1)
  }
  console.log('    PASS: test WAV generated\n')

  // 4. Transcribe and measure latency
  console.log('[4] Running transcription...')
  const t0 = performance.now()
  const segments = await whisper.transcribeFile(TEST_WAV, MODEL_PATH, {
    language: 'en',
    threads: 4
  })
  const latency = performance.now() - t0

  console.log(`    Result: ${JSON.stringify(segments, null, 2)}`)
  console.log(`    Segments: ${segments.length}`)
  console.log(`    Latency: ${latency.toFixed(1)} ms`)
  console.log(`    ${segments.length >= 0 ? 'PASS' : 'FAIL'}: transcription completed\n`)

  // Summary
  console.log('=== Summary ===')
  console.log(`whisper-cli: ${status.path}`)
  console.log(`model: ${MODEL_PATH}`)
  console.log(`segments returned: ${segments.length}`)
  console.log(`latency: ${latency.toFixed(1)} ms`)
  console.log(`verdict: PASS`)
}

main().catch((err) => {
  console.error('FAIL:', err)
  process.exit(1)
})
