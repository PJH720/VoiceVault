import { describe, expect, it } from 'vitest'
import { PromptService } from '../../src/main/services/PromptService'

describe('PromptService', () => {
  it('builds incremental prompt with previous summary', () => {
    const prompt = PromptService.incrementalSummary('old summary', 'new transcript')
    expect(prompt).toContain('old summary')
    expect(prompt).toContain('new transcript')
    expect(prompt).toContain('Respond ONLY with valid JSON')
  })

  it('builds final prompt with transcript', () => {
    const prompt = PromptService.finalSummary('full transcript')
    expect(prompt).toContain('full transcript')
    expect(prompt).toContain('"actionItems"')
    expect(prompt).toContain('Respond ONLY with JSON')
  })
})
