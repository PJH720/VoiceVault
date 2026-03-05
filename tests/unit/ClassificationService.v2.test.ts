import { describe, expect, it } from 'vitest'
import { ClassificationService } from '../../src/main/services/ClassificationService'
import type { RecordingTemplate } from '../../src/shared/types'

const templates: RecordingTemplate[] = [
  {
    id: 'meeting',
    name: 'Meeting',
    description: 'Team meeting',
    icon: '👥',
    color: '#3b82f6',
    category: 'built-in',
    keywords: ['meeting', 'agenda', 'attendees', 'action'],
    prompts: { summary: 'Summarize meeting' },
    createdAt: '2026-03-04T00:00:00.000Z',
    updatedAt: '2026-03-04T00:00:00.000Z'
  },
  {
    id: 'lecture',
    name: 'Lecture',
    description: 'Academic lecture',
    icon: '📚',
    color: '#10b981',
    category: 'built-in',
    keywords: ['lecture', 'professor', 'exam', 'homework'],
    prompts: { summary: 'Summarize lecture' },
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
    keywords: ['note', 'personal', 'diary'],
    prompts: { summary: 'Summarize note' },
    createdAt: '2026-03-04T00:00:00.000Z',
    updatedAt: '2026-03-04T00:00:00.000Z'
  }
]

const makeMockLLM = (response: string): { answerQuestion: () => Promise<string> } => ({
  answerQuestion: async () => response
})

const mockTemplateManager = {
  listTemplates: async () => templates
}

describe('ClassificationService — extended', () => {
  it('classifies with valid LLM response', async () => {
    const service = new ClassificationService(
      makeMockLLM('lecture') as never,
      mockTemplateManager as never
    )
    const result = await service.classifyRecording(
      'The professor explained the homework for the exam.'
    )
    expect(result.templateId).toBe('lecture')
    expect(result.confidence).toBe(0.85)
    expect(result.reasoning).toContain('LLM')
  })

  it('falls back to keywords when LLM throws', async () => {
    const failingLLM = {
      answerQuestion: async () => {
        throw new Error('model unavailable')
      }
    }
    const service = new ClassificationService(failingLLM as never, mockTemplateManager as never)
    const result = await service.classifyRecording(
      'In this lecture the professor discussed exam topics and homework.'
    )
    expect(result.templateId).toBe('lecture')
    expect(result.reasoning).toContain('Keyword')
  })

  it('keyword matching returns personal-note when no keywords match', async () => {
    const failingLLM = {
      answerQuestion: async () => {
        throw new Error('nope')
      }
    }
    const service = new ClassificationService(failingLLM as never, mockTemplateManager as never)
    const result = await service.classifyRecording('Random words without any category signal.')
    expect(result.templateId).toBe('personal-note')
    expect(result.confidence).toBe(0.3)
  })

  it('keyword matching calculates confidence as proportion', async () => {
    const failingLLM = {
      answerQuestion: async () => {
        throw new Error('nope')
      }
    }
    const service = new ClassificationService(failingLLM as never, mockTemplateManager as never)
    const result = await service.classifyRecording(
      'meeting agenda meeting attendees action lecture'
    )
    // meeting keywords: meeting(x2) + agenda(x1) + attendees(x1) + action(x1) = 5
    // lecture keywords: lecture(x1) = 1
    // confidence = 5/6
    expect(result.templateId).toBe('meeting')
    expect(result.confidence).toBeGreaterThan(0.7)
  })
})
