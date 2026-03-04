import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WhisperService } from '../../src/main/services/WhisperService'

vi.mock('electron', () => {
  return {
    app: {
      getPath: () => process.env.VV_TEST_USER_DATA ?? os.tmpdir()
    }
  }
})

describe('WhisperService', () => {
  let tmpDir = ''
  let service: WhisperService

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicevault-whisper-test-'))
    process.env.VV_TEST_USER_DATA = tmpDir
    service = new WhisperService('base')
  })

  afterEach(() => {
    service.destroy()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.VV_TEST_USER_DATA
  })

  it('checks model availability', async () => {
    const modelPath = service.getModelPath('base')
    expect(await service.isModelAvailable('base')).toBe(false)
    fs.mkdirSync(path.dirname(modelPath), { recursive: true })
    fs.writeFileSync(modelPath, 'model')
    expect(await service.isModelAvailable('base')).toBe(true)
  })

  it('transcribes chunk into segments', async () => {
    const modelPath = service.getModelPath('base')
    fs.mkdirSync(path.dirname(modelPath), { recursive: true })
    fs.writeFileSync(modelPath, 'model')

    const pcm = Buffer.alloc(16000 * 2 * 2)
    for (let i = 0; i < pcm.length; i += 2) {
      pcm.writeInt16LE(2000, i)
    }

    const segments = await service.transcribeChunk(pcm, 16000, Date.now())
    expect(segments.length).toBeGreaterThan(0)
    expect(segments[0].text).toContain('speech')
  })
})
