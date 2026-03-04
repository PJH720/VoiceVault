import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import type {
  ListOptions,
  Recording,
  RecordingSummaryRow,
  RecordingWithTranscript,
  SummaryOutput,
  TranscriptSegment
} from '../../shared/types'

type RecordingRow = {
  id: number
  title: string
  duration: number
  audio_path: string
  created_at: string
  updated_at: string
  category: string | null
  tags: string | null
  is_bookmarked: number
  is_archived: number
  file_size_bytes: number
}

type InsertRecordingInput = {
  title: string
  duration: number
  audioPath: string
  fileSizeBytes: number
  category?: string
  tags?: string[]
}

type UpdateRecordingInput = Partial<
  Pick<Recording, 'title' | 'category' | 'tags' | 'isBookmarked' | 'isArchived'>
>

type TranscriptSegmentRow = {
  id: number
  recording_id: number
  text: string
  start_time: number
  end_time: number
  language: string
  confidence: number
  words_json: string | null
}

type Migration = {
  id: number
  fileName: string
  sql: string
}

type SummaryRow = {
  id: number
  recording_id: number
  summary_text: string
  action_items: string | null
  discussion_points: string | null
  key_statements: string | null
  decisions: string | null
  created_at: string
}

export class DatabaseService {
  private readonly db: Database.Database
  private readonly dbPath: string

  public constructor() {
    this.dbPath = path.join(app.getPath('userData'), 'voicevault.db')
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true })
    this.db = new Database(this.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('foreign_keys = ON')
    this.runMigrations()
    this.ensureLegacyColumns()
  }

  public insertRecording(input: InsertRecordingInput): number {
    const stmt = this.db.prepare(`
      INSERT INTO recordings (
        title, duration, audio_path, category, tags, is_bookmarked, is_archived, file_size_bytes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, datetime('now'), datetime('now'))
    `)
    const result = stmt.run(
      input.title,
      input.duration,
      input.audioPath,
      input.category ?? null,
      input.tags ? JSON.stringify(input.tags) : null,
      input.fileSizeBytes
    )
    return Number(result.lastInsertRowid)
  }

  public createRecording(title: string, duration: number, audioPath: string): Recording | null {
    const id = this.insertRecording({
      title,
      duration,
      audioPath,
      fileSizeBytes: fs.existsSync(audioPath) ? fs.statSync(audioPath).size : 0
    })
    return this.getRecording(id)
  }

  public listRecordings(options: ListOptions = {}): Recording[] {
    const sortByMap: Record<NonNullable<ListOptions['sortBy']>, string> = {
      createdAt: 'created_at',
      duration: 'duration',
      title: 'title COLLATE NOCASE'
    }
    const sortBy = options.sortBy ?? 'createdAt'
    const sortOrder = options.sortOrder ?? 'DESC'
    const includeArchived = options.includeArchived ?? false
    const where: string[] = []
    const params: Array<string | number> = []

    if (!includeArchived) {
      where.push('is_archived = 0')
    }
    if (options.category) {
      where.push('category = ?')
      params.push(options.category)
    }
    if (options.search && options.search.trim()) {
      where.push(
        `(title LIKE ? OR id IN (SELECT recording_id FROM transcript_segments_fts WHERE transcript_segments_fts MATCH ?))`
      )
      params.push(`%${options.search.trim()}%`, options.search.trim())
    }

    let sql = `
      SELECT id, title, duration, audio_path, created_at, updated_at, category, tags, is_bookmarked, is_archived, file_size_bytes
      FROM recordings
    `
    if (where.length > 0) {
      sql += ` WHERE ${where.join(' AND ')}`
    }
    sql += ` ORDER BY ${sortByMap[sortBy]} ${sortOrder}`
    if (typeof options.limit === 'number' && options.limit > 0) {
      sql += ' LIMIT ?'
      params.push(options.limit)
    }
    if (typeof options.offset === 'number' && options.offset >= 0) {
      sql += ' OFFSET ?'
      params.push(options.offset)
    }

    const rows = this.db.prepare(sql).all(...params) as RecordingRow[]
    return rows.map(this.mapRow)
  }

  public getRecording(id: number): Recording | null {
    const row = this.db
      .prepare(
        `
      SELECT id, title, duration, audio_path, created_at, updated_at, category, tags, is_bookmarked, is_archived, file_size_bytes
      FROM recordings
      WHERE id = ? AND is_archived = 0
    `
      )
      .get(id) as RecordingRow | undefined
    return row ? this.mapRow(row) : null
  }

  public getRecordingWithTranscript(id: number): RecordingWithTranscript | null {
    const recording = this.getRecording(id)
    if (!recording) return null
    const segments = this.listTranscriptSegments(id)
    return { ...recording, segments }
  }

  public updateRecording(id: number, input: UpdateRecordingInput): Recording | null {
    const existing = this.getRecording(id)
    if (!existing) return null
    const nextTitle = input.title ?? existing.title
    const nextCategory = input.category ?? existing.category ?? null
    const nextTags = input.tags ?? existing.tags
    const nextBookmarked =
      typeof input.isBookmarked === 'boolean' ? Number(input.isBookmarked) : Number(existing.isBookmarked)
    const nextArchived =
      typeof input.isArchived === 'boolean' ? Number(input.isArchived) : Number(existing.isArchived)

    this.db
      .prepare(
        `
      UPDATE recordings
      SET title = ?, category = ?, tags = ?, is_bookmarked = ?, is_archived = ?, updated_at = datetime('now')
      WHERE id = ?
    `
      )
      .run(nextTitle, nextCategory, JSON.stringify(nextTags), nextBookmarked, nextArchived, id)
    return this.getRecording(id)
  }

  public deleteRecording(id: number, hard = false): Recording | null {
    const existing = this.getRecording(id)
    if (!existing) return null
    if (hard) {
      this.db.prepare('DELETE FROM recordings WHERE id = ?').run(id)
    } else {
      this.db
        .prepare("UPDATE recordings SET is_archived = 1, updated_at = datetime('now') WHERE id = ?")
        .run(id)
    }
    return existing
  }

  public searchRecordings(query: string, options: Omit<ListOptions, 'search'> = {}): Recording[] {
    return this.listRecordings({ ...options, search: query })
  }

  public insertTranscriptSegments(recordingId: number, segments: TranscriptSegment[]): number {
    if (segments.length === 0) return 0
    const insert = this.db.prepare(`
      INSERT INTO transcript_segments (
        recording_id, text, start_time, end_time, language, confidence, words_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const tx = this.db.transaction((items: TranscriptSegment[]) => {
      for (const item of items) {
        insert.run(
          recordingId,
          item.text,
          item.start,
          item.end,
          item.language,
          item.confidence,
          item.words ? JSON.stringify(item.words) : null
        )
      }
    })
    tx(segments)
    return segments.length
  }

  public listTranscriptSegments(recordingId: number): TranscriptSegment[] {
    const rows = this.db
      .prepare(
        `
      SELECT id, recording_id, text, start_time, end_time, language, confidence, words_json
      FROM transcript_segments
      WHERE recording_id = ?
      ORDER BY start_time ASC, id ASC
    `
      )
      .all(recordingId) as TranscriptSegmentRow[]
    return rows.map((row) => ({
      id: row.id,
      recordingId: row.recording_id,
      text: row.text,
      start: row.start_time,
      end: row.end_time,
      language: row.language,
      confidence: row.confidence,
      words: row.words_json ? (JSON.parse(row.words_json) as TranscriptSegment['words']) : undefined
    }))
  }

  public saveSummary(recordingId: number, output: SummaryOutput): number {
    const result = this.db
      .prepare(
        `
      INSERT INTO summaries (
        recording_id, summary_text, action_items, discussion_points, key_statements, decisions
      ) VALUES (?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        recordingId,
        output.summary,
        JSON.stringify(output.actionItems),
        JSON.stringify(output.discussionPoints),
        JSON.stringify(output.keyStatements),
        JSON.stringify(output.decisions)
      )
    return Number(result.lastInsertRowid)
  }

  public getLatestSummary(recordingId: number): RecordingSummaryRow | null {
    const row = this.db
      .prepare(
        `
      SELECT id, recording_id, summary_text, action_items, discussion_points, key_statements, decisions, created_at
      FROM summaries
      WHERE recording_id = ?
      ORDER BY id DESC
      LIMIT 1
    `
      )
      .get(recordingId) as SummaryRow | undefined
    if (!row) return null
    return {
      id: row.id,
      recordingId: row.recording_id,
      createdAt: row.created_at,
      output: {
        summary: row.summary_text,
        actionItems: row.action_items ? (JSON.parse(row.action_items) as SummaryOutput['actionItems']) : [],
        discussionPoints: row.discussion_points
          ? (JSON.parse(row.discussion_points) as string[])
          : [],
        keyStatements: row.key_statements
          ? (JSON.parse(row.key_statements) as SummaryOutput['keyStatements'])
          : [],
        decisions: row.decisions ? (JSON.parse(row.decisions) as string[]) : []
      }
    }
  }

  public close(): void {
    this.db.close()
  }

  private runMigrations(): void {
    const currentVersion = Number(this.db.pragma('user_version', { simple: true }))
    const migrations = this.loadMigrations()
    if (migrations.length === 0) return
    if (currentVersion < migrations.length) {
      this.backupDatabase()
    }
    const pending = migrations.filter((migration) => migration.id > currentVersion)
    for (const migration of pending) {
      this.db.transaction(() => {
        this.db.exec(migration.sql)
        this.db.pragma(`user_version = ${migration.id}`)
      })()
    }
  }

  private loadMigrations(): Migration[] {
    const appPath = typeof app.getAppPath === 'function' ? app.getAppPath() : process.cwd()
    const candidates = [
      path.join(__dirname, '../migrations'),
      path.join(appPath, 'src/main/migrations')
    ]
    const migrationsDir = candidates.find((dir) => fs.existsSync(dir))
    if (!migrationsDir) {
      return []
    }
    return fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort()
      .map((file) => ({
        id: Number(file.split('_')[0]),
        fileName: file,
        sql: fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
      }))
      .filter((entry) => Number.isFinite(entry.id) && entry.id > 0)
  }

  private backupDatabase(): void {
    if (!fs.existsSync(this.dbPath)) return
    const size = fs.statSync(this.dbPath).size
    if (size <= 0) return
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = `${this.dbPath}.${stamp}.bak`
    fs.copyFileSync(this.dbPath, backupPath)
  }

  private ensureLegacyColumns(): void {
    const columns = this.db
      .prepare(`SELECT name FROM pragma_table_info('recordings')`)
      .all() as Array<{ name: string }>
    const names = new Set(columns.map((entry) => entry.name))
    const statements: string[] = []
    if (!names.has('updated_at')) {
      statements.push("ALTER TABLE recordings ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))")
    }
    if (!names.has('tags')) {
      statements.push('ALTER TABLE recordings ADD COLUMN tags TEXT')
    }
    if (!names.has('is_archived')) {
      statements.push('ALTER TABLE recordings ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0')
    }
    if (!names.has('file_size_bytes')) {
      statements.push('ALTER TABLE recordings ADD COLUMN file_size_bytes INTEGER NOT NULL DEFAULT 0')
    }
    for (const statement of statements) {
      this.db.prepare(statement).run()
    }
  }

  private readonly mapRow = (row: RecordingRow): Recording => {
    let tags: string[] = []
    if (row.tags) {
      try {
        tags = JSON.parse(row.tags) as string[]
      } catch {
        tags = []
      }
    }

    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      duration: row.duration,
      audioPath: row.audio_path,
      category: row.category ?? undefined,
      tags,
      isBookmarked: row.is_bookmarked === 1,
      isArchived: row.is_archived === 1,
      fileSizeBytes: row.file_size_bytes
    }
  }
}
