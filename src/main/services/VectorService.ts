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

  public search(queryEmbedding: Float32Array, limit = 10): SearchResult[] {
    const rows = this.db
      .prepare(
        `
      SELECT id, recording_id, segment_id, text, embedding, metadata
      FROM vector_documents
    `
      )
      .all() as VectorRow[]
    const results = rows
      .map((row) => {
        const documentEmbedding = this.deserializeEmbedding(row.embedding)
        const similarity = this.cosineSimilarity(queryEmbedding, documentEmbedding)
        const metadata = this.parseMetadata(row.metadata)
        return {
          document: {
            id: row.id,
            recordingId: row.recording_id,
            segmentId: row.segment_id ?? undefined,
            text: row.text,
            embedding: documentEmbedding,
            metadata
          },
          similarity
        } satisfies SearchResult
      })
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, limit)
    return results
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
