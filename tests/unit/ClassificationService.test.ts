import { describe, expect, it } from 'vitest'
import type { RecordingTemplate } from '../../src/shared/types'
import { ClassificationService } from '../../src/main/services/ClassificationService'

const templates: RecordingTemplate[] = [
  {
    id: 'meeting',
    name: 'Meeting',
    description: 'Team meeting',
    icon: '👥',
    color: '#3b82f6',
    category: 'built-in',
    keywords: ['meeting', 'agenda', 'attendees'],
    prompts: { summary: 'Summarize meeting' },
    createdAt: '2026-03-04T00:00:00.000Z',
    updatedAt: '2026-03-04T00:00:00.000Z'
  },
  {
    id: 'personal-note',
    name: 'Personal Note',
    description: 'Personal note',
    icon: '📓',
    color: '#6b7280',
    category: 'built-in',
    keywords: ['note', 'personal'],
    prompts: { summary: 'Summarize personal note' },
    createdAt: '2026-03-04T00:00:00.000Z',
    updatedAt: '2026-03-04T00:00:00.000Z'
  }
]

describe('ClassificationService', () => {
  it('falls back to keyword classification when LLM result is invalid', async () => {
    const llmService = {
      answerQuestion: async () => 'invalid-template-id'
    }
    const templateManager = {
      listTemplates: async () => templates
    }
    const service = new ClassificationService(llmService as never, templateManager as never)

    const result = await service.classifyRecording(
      'This meeting discussed agenda and attendees for next sprint.'
    )
    expect(result.templateId).toBe('meeting')
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it('returns personal-note for empty transcript', async () => {
    const llmService = {
      answerQuestion: async () => 'meeting'
    }
    const templateManager = {
      listTemplates: async () => templates
    }
    const service = new ClassificationService(llmService as never, templateManager as never)

    const result = await service.classifyRecording('   ')
    expect(result.templateId).toBe('personal-note')
  })
})
