import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioCaptureService } from '../../src/main/services/AudioCaptureService'

vi.mock('electron', () => {
  return {
    BrowserWindow: {
      getAllWindows: () => []
    }
  }
})

describe('AudioCaptureService', () => {
  let outputDir = ''
  let service: AudioCaptureService

  beforeEach(() => {
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicevault-audio-test-'))
    service = new AudioCaptureService()
  })

  afterEach(() => {
    fs.rmSync(outputDir, { recursive: true, force: true })
  })

  it('creates wav file on stop', async () => {
    const startPath = await service.startRecording(outputDir)
    expect(startPath.endsWith('.wav')).toBe(true)

    await new Promise((resolve) => setTimeout(resolve, 60))
    const result = await service.stopRecording()

    expect(result.audioPath).toBe(startPath)
    expect(result.fileSizeBytes).toBeGreaterThanOrEqual(44)
    expect(fs.existsSync(result.audioPath)).toBe(true)
  })
})
