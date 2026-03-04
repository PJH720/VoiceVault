import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DiarizationService } from '../../src/main/services/DiarizationService'

vi.mock('electron', () => {
  return {
    app: {
      getPath: () => process.env.VV_TEST_USER_DATA ?? os.tmpdir()
    }
  }
})

describe('DiarizationService', () => {
  let tmpDir = ''
  let service: DiarizationService

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicevault-diarization-test-'))
    process.env.VV_TEST_USER_DATA = tmpDir
    service = new DiarizationService()
  })

  afterEach(() => {
    service.destroy()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.VV_TEST_USER_DATA
  })

  it('aligns transcript segments with maximum overlap speaker', () => {
    const aligned = service.alignTranscript(
      [
        { text: 'hello', start: 0, end: 2, language: 'en', confidence: 0.9 },
        { text: 'world', start: 2, end: 4, language: 'en', confidence: 0.9 }
      ],
      [
        { recordingId: 1, start: 0, end: 2.5, speaker: 'SPEAKER_00', confidence: 0.8 },
        { recordingId: 1, start: 2.2, end: 5, speaker: 'SPEAKER_01', confidence: 0.8 }
      ]
    )

    expect(aligned[0].speaker).toBe('SPEAKER_00')
    expect(aligned[1].speaker).toBe('SPEAKER_01')
  })

  it('falls back to heuristic diarization when model is unavailable', async () => {
    const audioPath = path.join(tmpDir, 'sample.wav')
    fs.writeFileSync(audioPath, Buffer.alloc(16000 * 2 * 3))
    const segments = await service.diarize(audioPath)
    expect(segments.length).toBeGreaterThan(0)
    expect(segments[0].speaker.startsWith('SPEAKER_')).toBe(true)
  })
})
