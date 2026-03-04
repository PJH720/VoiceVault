import Anthropic from '@anthropic-ai/sdk'
import type { CloudModelName, SummaryOutput } from '../../shared/types'
import { CostEstimator } from './CostEstimator'

const DEFAULT_MODEL: CloudModelName = 'claude-3-5-sonnet-20241022'

export class CloudLLMService {
  private readonly client: Anthropic | null

  public constructor(apiKey: string | null) {
    this.client = apiKey ? new Anthropic({ apiKey }) : null
  }

  public isConfigured(): boolean {
    return this.client !== null
  }

  public async summarize(
    transcript: string,
    model: CloudModelName = DEFAULT_MODEL,
    onToken?: (token: string) => void
  ): Promise<SummaryOutput> {
    if (!this.client) {
      throw new Error('API key not configured')
    }
    const prompt = this.buildPrompt(transcript)
    let fullText = ''
    let lastError: Error | null = null

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const stream = await this.client.messages.stream({
          model,
          max_tokens: 2048,
          temperature: 0.6,
          system:
            'You are a meeting assistant. Respond ONLY in valid JSON for structured summary fields.',
          messages: [{ role: 'user', content: prompt }]
        })

        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            fullText += chunk.delta.text
            onToken?.(chunk.delta.text)
          }
        }
        const finalMessage = await stream.finalMessage()
        const inputTokens = finalMessage.usage?.input_tokens ?? CostEstimator.estimateTokens(transcript)
        const outputTokens = finalMessage.usage?.output_tokens ?? CostEstimator.estimateTokens(fullText)
        return this.parseStructuredOutput(fullText, model, inputTokens, outputTokens)
      } catch (error) {
        lastError = error as Error
        const waitMs = (attempt + 1) * 500
        await new Promise((resolve) => setTimeout(resolve, waitMs))
      }
    }

    throw new Error(lastError?.message ?? 'Cloud summarization failed')
  }

  private buildPrompt(transcript: string): string {
    return `Analyze this transcript and output JSON only.

Transcript:
${transcript}

JSON schema:
{
  "summary": "2-3 sentence overview",
  "actionItems": [{"task":"","assignee":"","deadline":"","priority":"low|medium|high"}],
  "discussionPoints": ["..."],
  "keyStatements": [{"speaker":"","text":"","timestamp":0}],
  "decisions": ["..."]
}`
  }

  private parseStructuredOutput(
    text: string,
    model: CloudModelName,
    inputTokens: number,
    outputTokens: number
  ): SummaryOutput {
    try {
      const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i)
      const inline = text.match(/\{[\s\S]*\}/)
      const jsonText = (fenced?.[1] ?? inline?.[0] ?? text).trim()
      const parsed = JSON.parse(jsonText) as Partial<SummaryOutput>
      return {
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
        discussionPoints: Array.isArray(parsed.discussionPoints) ? parsed.discussionPoints : [],
        keyStatements: Array.isArray(parsed.keyStatements) ? parsed.keyStatements : [],
        decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
        metadata: {
          provider: 'anthropic',
          model,
          inputTokens,
          outputTokens,
          cost: CostEstimator.calculateCost(model, inputTokens, outputTokens)
        }
      }
    } catch {
      return {
        summary: text,
        actionItems: [],
        discussionPoints: [],
        keyStatements: [],
        decisions: [],
        metadata: {
          provider: 'anthropic',
          model,
          inputTokens,
          outputTokens,
          cost: CostEstimator.calculateCost(model, inputTokens, outputTokens)
        }
      }
    }
  }
}
