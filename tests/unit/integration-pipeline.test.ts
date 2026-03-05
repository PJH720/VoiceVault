import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return process.env.VV_TEST_USER_DATA ?? os.tmpdir()
      return os.tmpdir()
    },
    getAppPath: () => process.env.VV_TEST_APP_PATH ?? process.cwd()
  },
  BrowserWindow: {
    getAllWindows: () => []
  }
}))

import { AudioCaptureService } from '../../src/main/services/AudioCaptureService'
import { WhisperService } from '../../src/main/services/WhisperService'
import { LLMService } from '../../src/main/services/LLMService'
import { ClassificationService } from '../../src/main/services/ClassificationService'

describe('Integration: record → transcribe → summarize pipeline', () => {
  let tmpDir: string

  beforeEach(() => {
    vi.useFakeTimers()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-integration-'))
    process.env.VV_TEST_USER_DATA = tmpDir
  })

  afterEach(() => {
    vi.useRealTimers()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.VV_TEST_USER_DATA
  })

  it('full pipeline: record → get WAV → transcribe (fallback) → summarize (fallback)', async () => {
    // 1. Record audio
    const capture = new AudioCaptureService()
    const outputDir = path.join(tmpDir, 'recordings')
    await capture.startRecording(outputDir)
    await vi.advanceTimersByTimeAsync(2000)
    const result = await capture.stopRecording()
    expect(fs.existsSync(result.audioPath)).toBe(true)

    // 2. Prepare whisper model stub
    const whisper = new WhisperService('base')
    const modelPath = whisper.getModelPath('base')
    fs.mkdirSync(path.dirname(modelPath), { recursive: true })
    fs.writeFileSync(modelPath, 'model-stub')

    // Read the WAV and create PCM from it
    const wavBuf = fs.readFileSync(result.audioPath)
    const pcmData = wavBuf.subarray(44) // skip WAV header
    // Ensure enough data for transcription
    const paddedPcm = Buffer.alloc(Math.max(pcmData.length, 16000 * 2 * 2), 0)
    pcmData.copy(paddedPcm)
    // Write some signal
    for (let i = 0; i < paddedPcm.length; i += 2) {
      paddedPcm.writeInt16LE(Math.floor(Math.sin(i / 10) * 5000), i)
    }

    vi.useRealTimers()
    const segments = await whisper.transcribeChunk(paddedPcm, 16000, Date.now() - 3000)
    expect(segments.length).toBeGreaterThan(0)
    whisper.destroy()

    // 3. Summarize
    const llm = new LLMService('gemma-2-3n-instruct-q4_k_m')
    const transcript = segments.map((s) => s.text).join(' ')
    const summary = await llm.summarize(transcript, 'final', '')
    expect(summary).toHaveProperty('summary')
    expect(summary).toHaveProperty('discussionPoints')
    await llm.unload()
  })

  it('classification works in the pipeline context', async () => {
    vi.useRealTimers()
    const mockLLM = { answerQuestion: async () => 'meeting' }
    const mockTemplates = {
      listTemplates: async () => [
        {
          id: 'meeting',
          name: 'Meeting',
          description: 'Meeting',
          icon: '👥',
          color: '#000',
          category: 'built-in',
          keywords: ['meeting'],
          prompts: {},
          createdAt: '',
          updatedAt: ''
        },
        {
          id: 'personal-note',
          name: 'Note',
          description: 'Note',
          icon: '📓',
          color: '#000',
          category: 'built-in',
          keywords: ['note'],
          prompts: {},
          createdAt: '',
          updatedAt: ''
        }
      ]
    }
    const classifier = new ClassificationService(mockLLM as never, mockTemplates as never)
    const result = await classifier.classifyRecording('meeting agenda discussion')
    expect(result.templateId).toBe('meeting')
  })
})
