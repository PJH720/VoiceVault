import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VectorService } from '../../src/main/services/VectorService'

describe('VectorService', () => {
  let db: Database.Database
  let service: VectorService

  beforeEach(() => {
    db = new Database(':memory:')
    db
      .prepare(
        `CREATE TABLE vector_documents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          recording_id INTEGER NOT NULL,
          segment_id INTEGER,
          text TEXT NOT NULL,
          embedding BLOB NOT NULL,
          metadata TEXT
        )`
      )
      .run()
    service = new VectorService(db)
  })

  afterEach(() => {
    db.close()
  })

  it('retrieves top-k by cosine similarity', () => {
    service.insertVector({
      recordingId: 1,
      segmentId: 1,
      text: 'alpha project notes',
      embedding: new Float32Array([1, 0, 0]),
      metadata: { recordingTitle: 'Rec A', timestamp: 10 }
    })
    service.insertVector({
      recordingId: 2,
      segmentId: 2,
      text: 'beta launch summary',
      embedding: new Float32Array([0, 1, 0]),
      metadata: { recordingTitle: 'Rec B', timestamp: 20 }
    })

    const results = service.search(new Float32Array([0.9, 0.1, 0]), 1)
    expect(results).toHaveLength(1)
    expect(results[0].document.recordingId).toBe(1)
    expect(results[0].similarity).toBeGreaterThan(0.8)
  })
})
