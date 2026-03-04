import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LLMService } from '../../src/main/services/LLMService'

vi.mock('electron', () => {
  return {
    app: {
      getPath: () => process.env.VV_TEST_USER_DATA ?? os.tmpdir()
    }
  }
})

describe('LLMService', () => {
  let tmpDir = ''
  let service: LLMService

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicevault-llm-test-'))
    process.env.VV_TEST_USER_DATA = tmpDir
    service = new LLMService('gemma-2-3n-instruct-q4_k_m')
  })

  afterEach(async () => {
    await service.unload()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.VV_TEST_USER_DATA
  })

  it('returns empty summary for empty transcript', async () => {
    const output = await service.summarize('', 'final', '')
    expect(output.summary).toBe('')
    expect(output.actionItems).toEqual([])
  })

  it('falls back to heuristic summary when model is missing', async () => {
    const output = await service.summarize(
      '오늘 회의에서 API 배포를 결정했습니다. 내일까지 테스트를 진행해야 합니다.',
      'final',
      ''
    )
    expect(output.summary.length).toBeGreaterThan(0)
    expect(Array.isArray(output.discussionPoints)).toBe(true)
  })
})
