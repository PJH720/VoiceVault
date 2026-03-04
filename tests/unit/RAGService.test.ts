import { describe, expect, it } from 'vitest'
import { RAGService } from '../../src/main/services/RAGService'
import type { SearchResult } from '../../src/shared/types'

describe('RAGService', () => {
  it('builds citation-aware answer and sources', async () => {
    const embeddingService = {
      embed: async () => new Float32Array([1, 0, 0])
    }
    const vectorService = {
      search: (): SearchResult[] => [
        {
          similarity: 0.92,
          document: {
            id: 1,
            recordingId: 10,
            segmentId: 100,
            text: '프로젝트 마감은 금요일로 확정했다.',
            embedding: new Float32Array([1, 0, 0]),
            metadata: { recordingTitle: 'Sprint Meeting', timestamp: 125, speaker: 'Alice' }
          }
        }
      ]
    }
    const llmService = {
      answerQuestion: async () => '마감일은 금요일이다 [1].'
    }

    const service = new RAGService(
      embeddingService as never,
      vectorService as never,
      llmService as never
    )
    const output = await service.query('마감일이 언제야?', 3)

    expect(output.answer).toContain('[1]')
    expect(output.sources).toHaveLength(1)
    expect(output.sources[0].recordingTitle).toBe('Sprint Meeting')
    expect(output.sources[0].speaker).toBe('Alice')
  })
})
