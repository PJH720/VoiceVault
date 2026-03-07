import { describe, expect, it, vi } from 'vitest'
import { CloudLLMService } from '../../src/main/services/CloudLLMService'

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    public messages = {
      stream: async () => ({
        async *[Symbol.asyncIterator]() {
          yield {
            type: 'content_block_delta',
            delta: {
              type: 'text_delta',
              text: '{"summary":"ok","actionItems":[],"discussionPoints":[],"keyStatements":[],"decisions":[]}'
            }
          }
        },
        finalMessage: async () => ({
          usage: { input_tokens: 100, output_tokens: 50 }
        })
      })
    }
  }

  return {
    default: MockAnthropic
  }
})

describe('CloudLLMService', () => {
  it('throws when API key is missing', async () => {
    const service = new CloudLLMService(null)
    await expect(service.summarize('test')).rejects.toThrow('API key not configured')
  })

  it('parses streamed JSON summary output', async () => {
    const service = new CloudLLMService('sk-ant-test')
    const output = await service.summarize('meeting transcript')
    expect(output.summary).toBe('ok')
    expect(output.metadata?.provider).toBe('anthropic')
    expect(output.metadata?.cost).toBeGreaterThan(0)
  })
})
