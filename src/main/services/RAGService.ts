import type { RAGAnswer, SearchResult } from '../../shared/types'
import { EmbeddingService } from './EmbeddingService'
import { LLMService } from './LLMService'
import { VectorService } from './VectorService'

export class RAGService {
  public constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly vectorService: VectorService,
    private readonly llmService: LLMService
  ) {}

  public async query(question: string, topK = 5): Promise<RAGAnswer> {
    const trimmed = question.trim()
    if (!trimmed) {
      return { answer: '질문을 입력해 주세요.', sources: [] }
    }
    const queryEmbedding = await this.embeddingService.embed(trimmed)
    const rawResults = this.vectorService.search(queryEmbedding, Math.max(topK, 1))
    const reranked = this.rerank(rawResults, trimmed).slice(0, topK)
    const context = this.buildContext(reranked)
    const answer = await this.llmService.answerQuestion(trimmed, context)

    return {
      answer,
      sources: reranked.map((entry) => ({
        recordingId: entry.document.recordingId,
        recordingTitle: entry.document.metadata.recordingTitle,
        timestamp: entry.document.metadata.timestamp,
        speaker: entry.document.metadata.speaker,
        text: entry.document.text,
        relevance: entry.similarity
      }))
    }
  }

  private rerank(results: SearchResult[], question: string): SearchResult[] {
    const words = question.toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return results
    return results
      .map((entry) => {
        const lowered = entry.document.text.toLowerCase()
        const lexicalBoost = words.some((word) => lowered.includes(word)) ? 0.05 : 0
        return {
          ...entry,
          similarity: Math.min(1, entry.similarity + lexicalBoost)
        }
      })
      .sort((left, right) => right.similarity - left.similarity)
  }

  private buildContext(results: SearchResult[]): string {
    if (results.length === 0) return 'No context'
    return results
      .map((entry, index) => {
        const source = entry.document.metadata
        const timestamp =
          typeof source.timestamp === 'number' ? ` (${this.formatTimestamp(source.timestamp)})` : ''
        const speaker = source.speaker ? ` - ${source.speaker}` : ''
        return `[${index + 1}] ${source.recordingTitle}${timestamp}${speaker}\n${entry.document.text}`
      })
      .join('\n\n')
  }

  private formatTimestamp(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }
}
