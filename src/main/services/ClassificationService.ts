import type { ClassificationResult, RecordingTemplate } from '../../shared/types'
import { LLMService } from './LLMService'
import { TemplateManager } from './TemplateManager'

export class ClassificationService {
  public constructor(
    private readonly llmService: LLMService,
    private readonly templateManager: TemplateManager
  ) {}

  public async classifyRecording(transcript: string): Promise<ClassificationResult> {
    const trimmed = transcript.trim()
    if (!trimmed) {
      return {
        templateId: 'personal-note',
        confidence: 0.3,
        reasoning: 'Empty transcript fallback'
      }
    }
    const templates = await this.templateManager.listTemplates()
    try {
      return await this.classifyWithLLM(trimmed, templates)
    } catch {
      return this.classifyWithKeywords(trimmed, templates)
    }
  }

  private async classifyWithLLM(
    transcript: string,
    templates: RecordingTemplate[]
  ): Promise<ClassificationResult> {
    const descriptions = templates
      .map((template) => `${template.id}: ${template.description}`)
      .join('\n')
    const prompt = `Select one category id from this list:\n${descriptions}\nReturn only id.`
    const context = transcript.split(/\s+/).slice(0, 500).join(' ')
    const answer = await this.llmService.answerQuestion(prompt, context)
    const candidate = answer
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
    if (templates.some((template) => template.id === candidate)) {
      return {
        templateId: candidate,
        confidence: 0.85,
        reasoning: 'Classified by LLM'
      }
    }
    return this.classifyWithKeywords(transcript, templates)
  }

  private classifyWithKeywords(
    transcript: string,
    templates: RecordingTemplate[]
  ): ClassificationResult {
    const lower = transcript.toLowerCase()
    const scored = templates.map((template) => {
      const score = template.keywords.reduce((sum, keyword) => {
        const regex = new RegExp(`\\b${keyword.toLowerCase()}\\b`, 'g')
        const matches = lower.match(regex)
        return sum + (matches?.length ?? 0)
      }, 0)
      return { templateId: template.id, score }
    })
    scored.sort((left, right) => right.score - left.score)
    const top = scored[0]
    if (!top || top.score === 0) {
      return {
        templateId: 'personal-note',
        confidence: 0.3,
        reasoning: 'No keyword match'
      }
    }
    const total = scored.reduce((sum, item) => sum + item.score, 0)
    return {
      templateId: top.templateId,
      confidence: total > 0 ? top.score / total : 0.5,
      reasoning: `Keyword matching (${top.score})`
    }
  }
}
