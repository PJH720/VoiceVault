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
  private static readonly PARTITION_THRESHOLD = 1000
  private static readonly SAMPLES_PER_RECORDING = 5
  private static readonly TOP_RECORDINGS = 3

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
    const totalDocs = (
      this.db.prepare('SELECT COUNT(*) AS cnt FROM vector_documents').get() as { cnt: number }
    ).cnt

    if (totalDocs < VectorService.PARTITION_THRESHOLD) {
      return this.bruteForceScan(queryEmbedding, limit)
    }

    return this.partitionedSearch(queryEmbedding, limit)
  }

  private bruteForceScan(queryEmbedding: Float32Array, limit: number): SearchResult[] {
    const rows = this.db
      .prepare(
        `
      SELECT id, recording_id, segment_id, text, embedding, metadata
      FROM vector_documents
    `
      )
      .all() as VectorRow[]

    return this.scoreAndRank(rows, queryEmbedding, limit)
  }

  private partitionedSearch(queryEmbedding: Float32Array, limit: number): SearchResult[] {
    // Phase 1: get distinct recordings
    const recordingIds = (
      this.db.prepare('SELECT DISTINCT recording_id FROM vector_documents').all() as {
        recording_id: number
      }[]
    ).map((r) => r.recording_id)

    // Phase 2: score a sample from each recording
    const sampleStmt = this.db.prepare(
      `SELECT id, recording_id, segment_id, text, embedding, metadata
       FROM vector_documents
       WHERE recording_id = ?
       LIMIT ?`
    )

    const recordingScores: Array<{ recordingId: number; bestScore: number }> = []
    for (const recordingId of recordingIds) {
      const sampleRows = sampleStmt.all(
        recordingId,
        VectorService.SAMPLES_PER_RECORDING
      ) as VectorRow[]
      let best = -Infinity
      for (const row of sampleRows) {
        const score = this.cosineSimilarity(
          queryEmbedding,
          this.deserializeEmbedding(row.embedding)
        )
        if (score > best) best = score
      }
      recordingScores.push({ recordingId, bestScore: best })
    }

    // Phase 3: fully search only the top-k recordings
    recordingScores.sort((a, b) => b.bestScore - a.bestScore)
    const topRecordingIds = recordingScores
      .slice(0, VectorService.TOP_RECORDINGS)
      .map((r) => r.recordingId)

    const placeholders = topRecordingIds.map(() => '?').join(',')
    const fullRows = this.db
      .prepare(
        `SELECT id, recording_id, segment_id, text, embedding, metadata
         FROM vector_documents
         WHERE recording_id IN (${placeholders})`
      )
      .all(...topRecordingIds) as VectorRow[]

    return this.scoreAndRank(fullRows, queryEmbedding, limit)
  }

  private scoreAndRank(
    rows: VectorRow[],
    queryEmbedding: Float32Array,
    limit: number
  ): SearchResult[] {
    const results: SearchResult[] = []

    for (const row of rows) {
      const documentEmbedding = this.deserializeEmbedding(row.embedding)
      const similarity = this.cosineSimilarity(queryEmbedding, documentEmbedding)

      // Skip zero/invalid vectors
      if (similarity < 0) continue

      const metadata = this.parseMetadata(row.metadata)
      results.push({
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

    return results.sort((left, right) => right.similarity - left.similarity).slice(0, limit)
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
