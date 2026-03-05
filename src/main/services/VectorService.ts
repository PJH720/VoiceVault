import type Database from 'better-sqlite3'
import type { SearchResult, VectorDocument, VectorDocumentMetadata } from '../../shared/types'

type VectorRow = {
  id: number
  recording_id: number
  segment_id: number | null
  text: string
  embedding: Buffer
  metadata: string | null
}

export class VectorService {
  public constructor(private readonly db: Database.Database) {}

  public insertVector(doc: Omit<VectorDocument, 'id'>): number {
    const result = this.db
      .prepare(
        `
      INSERT INTO vector_documents (recording_id, segment_id, text, embedding, metadata)
      VALUES (?, ?, ?, ?, ?)
    `
      )
      .run(
        doc.recordingId,
        doc.segmentId ?? null,
        doc.text,
        this.serializeEmbedding(doc.embedding),
        JSON.stringify(doc.metadata)
      )
    return Number(result.lastInsertRowid)
  }

  public getVectorCount(): number {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM vector_documents').get() as {
      count: number
    }
    return result.count
  }

  public search(queryEmbedding: Float32Array, limit = 10): SearchResult[] {
    const totalCount = this.getVectorCount()

    if (totalCount === 0) {
      return []
    }

    // Adaptive strategy based on dataset size
    if (totalCount < 1000) {
      // Small dataset: process in chunks of 100
      return this.searchWithChunks(queryEmbedding, limit, 100)
    } else {
      // Large dataset: partitioned search, max 500 per chunk
      return this.searchWithPartitions(queryEmbedding, limit, 500)
    }
  }

  private searchWithChunks(
    queryEmbedding: Float32Array,
    limit: number,
    chunkSize: number
  ): SearchResult[] {
    const totalCount = this.getVectorCount()
    const allResults: SearchResult[] = []

    const stmt = this.db.prepare(`
      SELECT id, recording_id, segment_id, text, embedding, metadata
      FROM vector_documents
      LIMIT ? OFFSET ?
    `)

    for (let offset = 0; offset < totalCount; offset += chunkSize) {
      const rows = stmt.all(chunkSize, offset) as VectorRow[]

      for (const row of rows) {
        const documentEmbedding = this.deserializeEmbedding(row.embedding)
        const similarity = this.cosineSimilarity(queryEmbedding, documentEmbedding)

        // Skip zero/invalid vectors
        if (similarity < 0) continue

        const metadata = this.parseMetadata(row.metadata)
        allResults.push({
          document: {
            id: row.id,
            recordingId: row.recording_id,
            segmentId: row.segment_id ?? undefined,
            text: row.text,
            embedding: documentEmbedding,
            metadata
          },
          similarity
        })
      }
    }

    return allResults.sort((left, right) => right.similarity - left.similarity).slice(0, limit)
  }

  private searchWithPartitions(
    queryEmbedding: Float32Array,
    limit: number,
    partitionSize: number
  ): SearchResult[] {
    const totalCount = this.getVectorCount()
    const topResults: SearchResult[] = []

    const stmt = this.db.prepare(`
      SELECT id, recording_id, segment_id, text, embedding, metadata
      FROM vector_documents
      LIMIT ? OFFSET ?
    `)

    for (let offset = 0; offset < totalCount; offset += partitionSize) {
      const rows = stmt.all(partitionSize, offset) as VectorRow[]
      const partitionResults: SearchResult[] = []

      for (const row of rows) {
        const documentEmbedding = this.deserializeEmbedding(row.embedding)
        const similarity = this.cosineSimilarity(queryEmbedding, documentEmbedding)

        // Skip zero/invalid vectors
        if (similarity < 0) continue

        const metadata = this.parseMetadata(row.metadata)
        partitionResults.push({
          document: {
            id: row.id,
            recordingId: row.recording_id,
            segmentId: row.segment_id ?? undefined,
            text: row.text,
            embedding: documentEmbedding,
            metadata
          },
          similarity
        })
      }

      // Merge partition results with top results
      topResults.push(...partitionResults)
      topResults.sort((left, right) => right.similarity - left.similarity)

      // Keep only top 2N to avoid memory bloat while allowing for better candidates
      if (topResults.length > limit * 2) {
        topResults.splice(limit * 2)
      }
    }

    return topResults.slice(0, limit)
  }

  public deleteByRecording(recordingId: number): void {
    this.db.prepare('DELETE FROM vector_documents WHERE recording_id = ?').run(recordingId)
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) return -1

    let dot = 0
    for (let i = 0; i < a.length; i += 1) {
      dot += a[i] * b[i]
    }

    // Early exit for zero/near-zero similarity (indicates zero vectors)
    if (Math.abs(dot) < 1e-10) return -1

    return dot
  }

  private serializeEmbedding(embedding: Float32Array): Buffer {
    return Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength)
  }

  private deserializeEmbedding(buffer: Buffer): Float32Array {
    return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)
  }

  private parseMetadata(raw: string | null): VectorDocumentMetadata {
    if (!raw) {
      return { recordingTitle: 'Unknown recording' }
    }
    try {
      return JSON.parse(raw) as VectorDocumentMetadata
    } catch {
      return { recordingTitle: 'Unknown recording' }
    }
  }
}
