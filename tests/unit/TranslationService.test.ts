import Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { TranslationService } from '../../src/main/services/TranslationService'

function createDb(): Database.Database {
  const db = new Database(':memory:')
  db.prepare(
    `CREATE TABLE translation_cache (
      cache_key TEXT PRIMARY KEY,
      translation TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  ).run()
  db.prepare(
    `CREATE TABLE translated_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      segment_id INTEGER NOT NULL,
      target_language TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      confidence REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  ).run()
  return db
}

describe('TranslationService', () => {
  it('translates and caches repeated phrases', async () => {
    const db = createDb()
    const answerQuestion = vi.fn(async () => '안녕하세요')
    const service = new TranslationService(db, {
      answerQuestion,
      getModel: () => 'gemma-2-3n-instruct-q4_k_m'
    } as never)

    const first = await service.translate('hello', 'en', 'ko', 1)
    const second = await service.translate('hello', 'en', 'ko', 2)

    expect(first.translatedText).toBe('안녕하세요')
    expect(second.model).toBe('cached')
    expect(answerQuestion).toHaveBeenCalledTimes(1)
    const persisted = db
      .prepare('SELECT COUNT(*) AS count FROM translated_segments WHERE target_language = ?')
      .get('ko') as { count: number }
    expect(persisted.count).toBe(2)
  })

  it('batch translates with progress callback', async () => {
    const db = createDb()
    const service = new TranslationService(db, {
      answerQuestion: async () => 'translated',
      getModel: () => 'gemma-2-3n-instruct-q4_k_m'
    } as never)
    const progress = vi.fn()
    const result = await service.batchTranslate(
      [
        { id: 11, text: 'one' },
        { id: 12, text: 'two' }
      ],
      'en',
      'ja',
      progress
    )

    expect(result.size).toBe(2)
    expect(progress).toHaveBeenCalledTimes(2)
    expect(progress).toHaveBeenLastCalledWith(2, 2, expect.any(Object), 12)
  })
})
