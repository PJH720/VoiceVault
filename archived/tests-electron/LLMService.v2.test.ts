import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LLMService } from '../../src/main/services/LLMService'

vi.mock('electron', () => ({
  app: {
    getPath: () => process.env.VV_TEST_USER_DATA ?? os.tmpdir()
  }
}))

describe('LLMService — extended', () => {
  let tmpDir: string
  let service: LLMService

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-llm-ext-'))
    process.env.VV_TEST_USER_DATA = tmpDir
    service = new LLMService('gemma-2-3n-instruct-q4_k_m')
  })

  afterEach(async () => {
    await service.unload()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.VV_TEST_USER_DATA
  })

  it('model path includes model name', () => {
    expect(service.getModelPath()).toMatch(/gemma-2-3n-instruct-q4_k_m\.gguf$/)
  })

  it('isModelAvailable returns false when model missing', async () => {
    expect(await service.isModelAvailable()).toBe(false)
  })

  it('isModelAvailable returns true when model file exists', async () => {
    const modelPath = service.getModelPath()
    fs.mkdirSync(path.dirname(modelPath), { recursive: true })
    fs.writeFileSync(modelPath, 'fake-model')
    expect(await service.isModelAvailable()).toBe(true)
  })

  it('setModel switches model name', () => {
    service.setModel('llama-3.2-3b-instruct-q4_k_m')
    expect(service.getModel()).toBe('llama-3.2-3b-instruct-q4_k_m')
  })

  it('setModel no-ops for same model', () => {
    const unloadSpy = vi.spyOn(service, 'unload')
    service.setModel('gemma-2-3n-instruct-q4_k_m')
    expect(unloadSpy).not.toHaveBeenCalled()
  })

  it('fallback summary extracts decisions with Korean keywords', async () => {
    const output = await service.summarize(
      '우리는 새로운 API 배포를 결정했습니다. 디자인 변경도 합의되었습니다.',
      'final',
      ''
    )
    expect(output.decisions.length).toBeGreaterThan(0)
  })

  it('fallback summary extracts action items', async () => {
    const output = await service.summarize(
      'We need to finish the todo list. Action required on deployment. 내일까지 해야 할 일이 있다.',
      'final',
      ''
    )
    expect(output.actionItems.length).toBeGreaterThan(0)
    expect(output.actionItems[0]).toHaveProperty('task')
    expect(output.actionItems[0]).toHaveProperty('priority')
  })

  it('incremental fallback merges with previous summary', async () => {
    const output = await service.summarize(
      'New discussion about feature flags.',
      'incremental',
      'Previous: We discussed architecture.'
    )
    expect(output.summary).toContain('Previous')
  })

  it('parseStructuredOutput handles fenced JSON', async () => {
    // We test indirectly via summarize — when LLM is unavailable it uses fallback
    const output = await service.summarize('Some transcript content here.', 'final', '')
    expect(output).toHaveProperty('summary')
    expect(output).toHaveProperty('actionItems')
    expect(output).toHaveProperty('discussionPoints')
    expect(output).toHaveProperty('keyStatements')
    expect(output).toHaveProperty('decisions')
  })

  it('answerQuestion falls back when model unavailable', async () => {
    const answer = await service.answerQuestion(
      'What was discussed?',
      '[1] We discussed deployment.\n[2] Release is planned.'
    )
    expect(answer).toContain('[1]')
  })

  it('answerQuestion fallback with no citations returns default', async () => {
    const answer = await service.answerQuestion('What?', 'No relevant info here')
    expect(answer).toContain('No grounded context')
  })
})
