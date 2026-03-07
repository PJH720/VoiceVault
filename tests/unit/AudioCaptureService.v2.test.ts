import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [{ webContents: { send: vi.fn() } }]
  }
}))

import { AudioCaptureService } from '../../src/main/services/AudioCaptureService'

describe('AudioCaptureService — extended', () => {
  let outputDir: string
  let service: AudioCaptureService

  beforeEach(() => {
    vi.useFakeTimers()
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-audio-ext-'))
    service = new AudioCaptureService()
  })

  afterEach(() => {
    vi.useRealTimers()
    fs.rmSync(outputDir, { recursive: true, force: true })
  })

  it('enters fallback mode when native-audio-node is unavailable', async () => {
    await service.startRecording(outputDir)
    expect(service.getCaptureMode()).toBe('web-audio')
  })

  it('throws when starting a second recording', async () => {
    await service.startRecording(outputDir)
    await expect(service.startRecording(outputDir)).rejects.toThrow('already in progress')
    await service.stopRecording()
  })

  it('throws when stopping without a recording', async () => {
    await expect(service.stopRecording()).rejects.toThrow('Not currently recording')
  })

  it('tracks recording state', async () => {
    expect(service.recording).toBe(false)
    await service.startRecording(outputDir)
    expect(service.recording).toBe(true)
    expect(service.recordingStartedAt).toBeGreaterThan(0)
    await service.stopRecording()
    expect(service.recording).toBe(false)
  })

  it('generates valid WAV header in fallback mode', async () => {
    await service.startRecording(outputDir)
    await vi.advanceTimersByTimeAsync(200)
    const result = await service.stopRecording()

    const buf = fs.readFileSync(result.audioPath)
    expect(buf.toString('ascii', 0, 4)).toBe('RIFF')
    expect(buf.toString('ascii', 8, 12)).toBe('WAVE')
    expect(buf.toString('ascii', 12, 16)).toBe('fmt ')
    expect(buf.readUInt16LE(20)).toBe(1) // PCM
    expect(buf.readUInt16LE(22)).toBe(1) // mono
    expect(buf.readUInt32LE(24)).toBe(16000) // sample rate
    expect(buf.readUInt16LE(34)).toBe(16) // bits per sample
    expect(buf.toString('ascii', 36, 40)).toBe('data')
  })

  it('onAudioChunk listener can be registered and unregistered', async () => {
    const chunks: Buffer[] = []
    const unsub = service.onAudioChunk((chunk) => chunks.push(chunk))
    expect(typeof unsub).toBe('function')
    unsub()
  })

  it('creates output directory recursively', async () => {
    const nested = path.join(outputDir, 'a', 'b', 'c')
    const audioPath = await service.startRecording(nested)
    expect(audioPath).toContain('recording-')
    await service.stopRecording()
    expect(fs.existsSync(nested)).toBe(true)
  })

  it('returns correct duration on stop', async () => {
    await service.startRecording(outputDir)
    await vi.advanceTimersByTimeAsync(3000)
    const result = await service.stopRecording()
    // duration should be ~3s (at least > 2s given timer advance)
    expect(result.duration).toBeGreaterThanOrEqual(2.5)
  })
})
