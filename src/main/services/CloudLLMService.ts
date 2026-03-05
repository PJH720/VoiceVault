import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import type {
  CloudModelName,
  AnthropicModelName,
  OpenAIModelName,
  GeminiModelName,
  SummaryOutput
} from '../../shared/types'
import { CostEstimator } from './CostEstimator'

const DEFAULT_MODEL: CloudModelName = 'claude-3-5-sonnet-20241022'

export class CloudLLMService {
  private readonly anthropicClient: Anthropic | null
  private readonly openaiClient: OpenAI | null
  private readonly geminiClient: GoogleGenerativeAI | null

  public constructor(
    anthropicApiKey: string | null,
    openaiApiKey: string | null,
    geminiApiKey: string | null
  ) {
    this.anthropicClient = anthropicApiKey ? new Anthropic({ apiKey: anthropicApiKey }) : null
    this.openaiClient = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null
    this.geminiClient = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null
  }

  public isConfigured(): boolean {
    return this.anthropicClient !== null
  }

  public isOpenAIConfigured(): boolean {
    return this.openaiClient !== null
  }

  public isGeminiConfigured(): boolean {
    return this.geminiClient !== null
  }

  public async summarize(
    transcript: string,
    model: AnthropicModelName = DEFAULT_MODEL as AnthropicModelName,
    onToken?: (token: string) => void
  ): Promise<SummaryOutput> {
    if (!this.anthropicClient) {
      throw new Error('Anthropic API key not configured')
    }
    const prompt = this.buildPrompt(transcript)
    let fullText = ''
    let lastError: Error | null = null

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const stream = await this.anthropicClient.messages.stream({
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
        return this.parseAnthropicOutput(fullText, model, inputTokens, outputTokens)
      } catch (error) {
        lastError = error as Error
        const waitMs = (attempt + 1) * 500
        await new Promise((resolve) => setTimeout(resolve, waitMs))
      }
    }

    throw new Error(lastError?.message ?? 'Cloud summarization failed')
  }

  public async summarizeWithOpenAI(
    transcript: string,
    model: OpenAIModelName,
    onToken?: (token: string) => void
  ): Promise<SummaryOutput> {
    if (!this.openaiClient) {
      throw new Error('OpenAI API key not configured')
    }

    const prompt = this.buildPrompt(transcript)
    let fullText = ''
    let inputTokens = 0
    let outputTokens = 0

    try {
      const response = await this.openaiClient.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are a meeting assistant. Respond ONLY in valid JSON for structured summary fields.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.6,
        max_tokens: 2048,
        stream: !!onToken
      })

      if (onToken && typeof response[Symbol.asyncIterator] === 'function') {
        // Streaming mode
        for await (const chunk of response as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>) {
          const content = chunk.choices[0]?.delta?.content
          if (content) {
            fullText += content
            onToken(content)
          }
        }
        inputTokens = CostEstimator.estimateTokens(transcript)
        outputTokens = CostEstimator.estimateTokens(fullText)
      } else {
        // Non-streaming mode
        const completion = response as OpenAI.Chat.Completions.ChatCompletion
        fullText = completion.choices[0]?.message?.content ?? ''
        inputTokens = completion.usage?.prompt_tokens ?? CostEstimator.estimateTokens(transcript)
        outputTokens = completion.usage?.completion_tokens ?? CostEstimator.estimateTokens(fullText)
      }

      return this.parseOpenAIOutput(fullText, model, inputTokens, outputTokens)
    } catch (error) {
      throw new Error(`OpenAI summarization failed: ${(error as Error).message}`)
    }
  }

  public async summarizeWithGemini(
    transcript: string,
    model: GeminiModelName,
    onToken?: (token: string) => void
  ): Promise<SummaryOutput> {
    if (!this.geminiClient) {
      throw new Error('Gemini API key not configured')
    }

    const prompt = this.buildPrompt(transcript)
    let fullText = ''

    try {
      const generativeModel = this.geminiClient.getGenerativeModel({ model })
      const result = await generativeModel.generateContentStream(prompt)

      for await (const chunk of result.stream) {
        const chunkText = chunk.text()
        fullText += chunkText
        if (onToken) {
          onToken(chunkText)
        }
      }

      const inputTokens = CostEstimator.estimateTokens(transcript)
      const outputTokens = CostEstimator.estimateTokens(fullText)

      return this.parseGeminiOutput(fullText, model, inputTokens, outputTokens)
    } catch (error) {
      throw new Error(`Gemini summarization failed: ${(error as Error).message}`)
    }
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

  private parseAnthropicOutput(
    text: string,
    model: AnthropicModelName,
    inputTokens: number,
    outputTokens: number
  ): SummaryOutput {
    return this.parseStructuredOutput(text, 'anthropic', model, inputTokens, outputTokens)
  }

  private parseOpenAIOutput(
    text: string,
    model: OpenAIModelName,
    inputTokens: number,
    outputTokens: number
  ): SummaryOutput {
    return this.parseStructuredOutput(text, 'openai', model, inputTokens, outputTokens)
  }

  private parseGeminiOutput(
    text: string,
    model: GeminiModelName,
    inputTokens: number,
    outputTokens: number
  ): SummaryOutput {
    return this.parseStructuredOutput(text, 'gemini', model, inputTokens, outputTokens)
  }

  private parseStructuredOutput(
    text: string,
    provider: 'anthropic' | 'openai' | 'gemini',
    model: string,
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
          provider,
          model,
          inputTokens,
          outputTokens,
          cost: this.calculateCost(provider, model, inputTokens, outputTokens)
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
          provider,
          model,
          inputTokens,
          outputTokens,
          cost: this.calculateCost(provider, model, inputTokens, outputTokens)
        }
      }
    }
  }

  private calculateCost(
    provider: 'anthropic' | 'openai' | 'gemini',
    model: string,
    inputTokens: number,
    outputTokens: number
  ): number {
    if (provider === 'anthropic') {
      return CostEstimator.calculateCost(model as AnthropicModelName, inputTokens, outputTokens)
    }
    // For now, return estimated costs for OpenAI and Gemini
    // These should be updated with actual pricing
    if (provider === 'openai') {
      const inputCostPer1M = model === 'gpt-4o' ? 2.5 : 0.15 // gpt-4o: $2.50, gpt-4o-mini: $0.15
      const outputCostPer1M = model === 'gpt-4o' ? 10.0 : 0.6 // gpt-4o: $10.00, gpt-4o-mini: $0.60
      return (inputTokens / 1_000_000) * inputCostPer1M + (outputTokens / 1_000_000) * outputCostPer1M
    }
    if (provider === 'gemini') {
      // Gemini pricing (approximated)
      const inputCostPer1M = model.includes('flash') ? 0.075 : 1.25
      const outputCostPer1M = model.includes('flash') ? 0.3 : 5.0
      return (inputTokens / 1_000_000) * inputCostPer1M + (outputTokens / 1_000_000) * outputCostPer1M
    }
    return 0
  }
}
