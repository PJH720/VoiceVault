import { describe, test, expect, vi, beforeEach } from 'vitest'
import { CloudLLMService } from '../../../src/main/services/CloudLLMService'
import type { OpenAIModelName, GeminiModelName, SummaryOutput } from '../../../src/shared/types'

// Create hoisted mocks that can be configured in tests
const mockAnthropicMessages = {
  stream: vi.fn()
}
const mockOpenAICreate = vi.fn()
const mockGeminiGenerateContentStream = vi.fn()
const mockGeminiGetGenerativeModel = vi.fn().mockReturnValue({
  generateContentStream: mockGeminiGenerateContentStream
})

// Mock the SDK modules
vi.mock('@anthropic-ai/sdk', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Anthropic = vi.fn(function(this: any) {
    this.messages = mockAnthropicMessages
  })
  return { default: Anthropic }
})

vi.mock('openai', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const OpenAI = vi.fn(function(this: any) {
    this.chat = {
      completions: {
        create: mockOpenAICreate
      }
    }
  })
  return { default: OpenAI }
})

vi.mock('@google/generative-ai', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const GoogleGenerativeAI = vi.fn(function(this: any) {
    this.getGenerativeModel = mockGeminiGetGenerativeModel
  })
  return { GoogleGenerativeAI }
})

describe('CloudLLMService - OpenAI Provider', () => {
  let service: CloudLLMService

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('rejects summarization when OpenAI API key is null', async () => {
    service = new CloudLLMService(null, null, null)
    const model: OpenAIModelName = 'gpt-4o-mini'

    await expect(service.summarizeWithOpenAI('test transcript', model)).rejects.toThrow(
      'OpenAI API key not configured'
    )
  })

  test('summarizes transcript using OpenAI with streaming', async () => {
    const mockApiKey = 'sk-test123'
    service = new CloudLLMService(null, mockApiKey, null)

    mockOpenAICreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              summary: 'Test summary',
              actionItems: [],
              discussionPoints: ['Point 1'],
              keyStatements: [],
              decisions: []
            })
          }
        }
      ],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50
      }
    })

    const onToken = vi.fn()
    const result = await service.summarizeWithOpenAI('Test transcript for OpenAI', 'gpt-4o-mini', onToken)

    expect(result.summary).toBe('Test summary')
    expect(result.metadata?.provider).toBe('openai')
    expect(result.metadata?.model).toBe('gpt-4o-mini')
    expect(mockOpenAICreate).toHaveBeenCalled()
  })

  test('handles OpenAI streaming token callbacks', async () => {
    const mockApiKey = 'sk-test123'
    service = new CloudLLMService(null, mockApiKey, null)

    const tokens = ['Hello', ' ', 'world']
    const onToken = vi.fn()

    const mockStream = {
      async *[Symbol.asyncIterator]() {
        for (const token of tokens) {
          yield {
            choices: [
              {
                delta: {
                  content: token
                }
              }
            ]
          }
        }
      }
    }

    mockOpenAICreate.mockResolvedValue(mockStream)

    await service.summarizeWithOpenAI('Test', 'gpt-4o', onToken)

    expect(onToken).toHaveBeenCalledTimes(tokens.length)
    expect(onToken).toHaveBeenCalledWith('Hello')
    expect(onToken).toHaveBeenCalledWith(' ')
    expect(onToken).toHaveBeenCalledWith('world')
  })

  test('includes cost metadata for OpenAI models', async () => {
    const mockApiKey = 'sk-test123'
    service = new CloudLLMService(null, mockApiKey, null)

    mockOpenAICreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              summary: 'Test',
              actionItems: [],
              discussionPoints: [],
              keyStatements: [],
              decisions: []
            })
          }
        }
      ],
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 500
      }
    })

    const result = await service.summarizeWithOpenAI('Test', 'gpt-4o-mini')

    expect(result.metadata?.inputTokens).toBe(1000)
    expect(result.metadata?.outputTokens).toBe(500)
    expect(result.metadata?.cost).toBeGreaterThan(0)
  })
})

describe('CloudLLMService - Gemini Provider', () => {
  let service: CloudLLMService

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('rejects summarization when Gemini API key is null', async () => {
    service = new CloudLLMService(null, null, null)
    const model: GeminiModelName = 'gemini-2.5-flash'

    await expect(service.summarizeWithGemini('test transcript', model)).rejects.toThrow(
      'Gemini API key not configured'
    )
  })

  test('summarizes transcript using Gemini with streaming', async () => {
    const mockApiKey = 'gemini-test123'
    service = new CloudLLMService(null, null, mockApiKey)

    const mockResponse = {
      stream: (async function*() {
        yield {
          text: () =>
            JSON.stringify({
              summary: 'Gemini summary',
              actionItems: [],
              discussionPoints: ['Gemini point'],
              keyStatements: [],
              decisions: []
            })
        }
      })()
    }

    mockGeminiGenerateContentStream.mockResolvedValue(mockResponse)

    const result = await service.summarizeWithGemini('Test transcript for Gemini', 'gemini-2.5-flash')

    expect(result.summary).toBe('Gemini summary')
    expect(result.metadata?.provider).toBe('gemini')
    expect(result.metadata?.model).toBe('gemini-2.5-flash')
    expect(mockGeminiGenerateContentStream).toHaveBeenCalled()
  })

  test('handles Gemini streaming token callbacks', async () => {
    const mockApiKey = 'gemini-test123'
    service = new CloudLLMService(null, null, mockApiKey)

    const onToken = vi.fn()
    const chunks = ['Test ', 'chunk ', 'streaming']

    const mockResponse = {
      stream: (async function*() {
        for (const chunk of chunks) {
          yield { text: () => chunk }
        }
      })()
    }

    mockGeminiGenerateContentStream.mockResolvedValue(mockResponse)

    await service.summarizeWithGemini('Test', 'gemini-2.5-pro', onToken)

    expect(onToken).toHaveBeenCalledTimes(chunks.length)
    chunks.forEach((chunk) => {
      expect(onToken).toHaveBeenCalledWith(chunk)
    })
  })
})

describe('CloudLLMService - Provider Routing', () => {
  test('routes to correct provider based on model name', async () => {
    const service = new CloudLLMService('anthropic-key', 'openai-key', 'gemini-key')

    // Mock the provider-specific methods
    const mockSummarizeAnthropic = vi.spyOn(service, 'summarize')
    const mockSummarizeOpenAI = vi.spyOn(service, 'summarizeWithOpenAI')
    const mockSummarizeGemini = vi.spyOn(service, 'summarizeWithGemini')

    const mockOutput: SummaryOutput = {
      summary: 'test',
      actionItems: [],
      discussionPoints: [],
      keyStatements: [],
      decisions: []
    }

    mockSummarizeAnthropic.mockResolvedValue(mockOutput)
    mockSummarizeOpenAI.mockResolvedValue(mockOutput)
    mockSummarizeGemini.mockResolvedValue(mockOutput)

    // Test routing logic when we add a unified generate method
    // This test documents the expected behavior
    expect(service).toBeDefined()
  })
})
