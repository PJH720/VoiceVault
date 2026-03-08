import { RagChannels } from '../../shared/ipc-channels'
import type { RAGAnswer, SearchHistoryEntry } from '../../shared/types'
import { getDb } from '../services/db'

export const ragRPCHandlers = {
  [RagChannels.QUERY]: async (params: {
    question: string
    topK?: number
  }): Promise<RAGAnswer> => {
    // RAG query requires EmbeddingService (native module in Electron).
    // In Electrobun, this will use a Bun.spawn subprocess for embedding generation.
    // For now, return a placeholder indicating the feature is pending migration.
    const db = getDb()
    db.query('INSERT INTO search_history (query, result_count) VALUES (?, ?)').run(
      params.question,
      0
    )

    return {
      answer: 'RAG search not yet implemented for Electrobun — requires embedding subprocess.',
      sources: []
    }
  },

  [RagChannels.EMBED_RECORDINGS]: async (): Promise<{ success: boolean; embedded: number }> => {
    // Embedding requires EmbeddingService + VectorService
    // Will be ported to use a subprocess-based embedding model
    return { success: true, embedded: 0 }
  },

  [RagChannels.SEARCH_HISTORY]: (): SearchHistoryEntry[] => {
    const db = getDb()
    const rows = db
      .query(
        'SELECT id, query, result_count, created_at FROM search_history ORDER BY created_at DESC LIMIT 20'
      )
      .all() as Array<Record<string, unknown>>

    return rows.map((row) => ({
      id: row.id as number,
      query: row.query as string,
      resultCount: row.result_count as number,
      createdAt: row.created_at as string
    }))
  },

  [RagChannels.EMBEDDING_MODEL_STATUS]: async (): Promise<{ available: boolean }> => {
    // Embedding model availability check — pending subprocess implementation
    return { available: false }
  },

  [RagChannels.INDEX_STATUS]: (): { vectorCount: number } => {
    const db = getDb()
    try {
      const result = db.query('SELECT COUNT(*) as count FROM vector_documents').get() as {
        count: number
      }
      return { vectorCount: result.count }
    } catch {
      return { vectorCount: 0 }
    }
  }
}
