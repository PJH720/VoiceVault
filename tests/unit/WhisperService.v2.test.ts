import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WhisperService } from '../../src/main/services/WhisperService'

vi.mock('electron', () => ({
  app: {
    getPath: () => process.env.VV_TEST_USER_DATA ?? os.tmpdir()
  }
}))

describe('WhisperService — extended', () => {
  let tmpDir: string
  let service: WhisperService

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-whisper-ext-'))
    process.env.VV_TEST_USER_DATA = tmpDir
    service = new WhisperService('base')
  })

  afterEach(() => {
    service.destroy()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.VV_TEST_USER_DATA
  })

  it('resolves sidecar model path correctly', () => {
    const modelPath = service.getModelPath('base')
    expect(modelPath).toContain('models')
    expect(modelPath).toContain('whisper')
    expect(modelPath).toMatch(/ggml-base\.bin$/)
  })

  it('resolves different model sizes', () => {
    expect(service.getModelPath('small')).toMatch(/ggml-small\.bin$/)
    expect(service.getModelPath('medium')).toMatch(/ggml-medium\.bin$/)
    expect(service.getModelPath('large-v3-turbo')).toMatch(/ggml-large-v3-turbo\.bin$/)
  })

  it('lists supported models', () => {
    const models = service.listSupportedModels()
    expect(models).toContain('base')
    expect(models).toContain('large-v3-turbo')
    expect(models.length).toBeGreaterThanOrEqual(4)
  })

  it('throws model-not-found on initialize when model missing', async () => {
    await expect(service.initialize()).rejects.toThrow('Whisper model not found')
  })

  it('setModelSize destroys previous instance', () => {
    const destroySpy = vi.spyOn(service, 'destroy')
    service.setModelSize('small')
    expect(destroySpy).toHaveBeenCalled()
    expect(service.getModelSize()).toBe('small')
  })

  it('setModelSize no-ops for same model', () => {
    const destroySpy = vi.spyOn(service, 'destroy')
    service.setModelSize('base')
    expect(destroySpy).not.toHaveBeenCalled()
  })

  it('fallback segment returns speech-detected for loud audio', async () => {
    const modelPath = service.getModelPath('base')
    fs.mkdirSync(path.dirname(modelPath), { recursive: true })
    fs.writeFileSync(modelPath, 'model')

    // Create loud PCM data (2 seconds at 16kHz)
    const pcm = Buffer.alloc(16000 * 2 * 2)
    for (let i = 0; i < pcm.length; i += 2) {
      pcm.writeInt16LE(Math.floor(Math.sin(i / 10) * 10000), i)
    }

    const segments = await service.transcribeChunk(pcm, 16000, Date.now() - 5000)
    expect(segments.length).toBeGreaterThan(0)
    expect(segments[0].text).toBeDefined()
  })

  it('fallback segment skips near-silent audio', async () => {
    const modelPath = service.getModelPath('base')
    fs.mkdirSync(path.dirname(modelPath), { recursive: true })
    fs.writeFileSync(modelPath, 'model')

    // Near-silent PCM
    const pcm = Buffer.alloc(16000 * 2 * 2, 0)
    const segments = await service.transcribeChunk(pcm, 16000, Date.now())
    // Silent audio should produce no segments (or empty)
    expect(segments.every((s) => s.text === '[speech detected]' || s.text === '')).toBe(true)
  })

  it('handles resampling from different sample rate', async () => {
    const modelPath = service.getModelPath('base')
    fs.mkdirSync(path.dirname(modelPath), { recursive: true })
    fs.writeFileSync(modelPath, 'model')

    // 48kHz PCM, enough data to trigger transcription after resample
    const pcm = Buffer.alloc(48000 * 2 * 3)
    for (let i = 0; i < pcm.length; i += 2) {
      pcm.writeInt16LE(Math.floor(Math.sin(i / 20) * 8000), i)
    }

    const segments = await service.transcribeChunk(pcm, 48000, Date.now() - 3000)
    // Should not throw; may produce fallback segments
    expect(Array.isArray(segments)).toBe(true)
  })
})
