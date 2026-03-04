import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import type {
  ListOptions,
  Recording,
  RecordingSummaryRow,
  RecordingWithTranscript,
  SpeakerProfile,
  SpeakerSegment,
  SearchHistoryEntry,
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
  template_id: string | null
  classification_confidence: number | null
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
  Pick<
    Recording,
    'title' | 'category' | 'tags' | 'isBookmarked' | 'isArchived' | 'templateId' | 'classificationConfidence'
  >
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
  speaker_profile_id?: number | null
  speaker_name?: string | null
  speaker_color?: string | null
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

type SpeakerSegmentRow = {
  id: number
  recording_id: number
  speaker_profile_id: number | null
  start_time: number
  end_time: number
  confidence: number
  raw_speaker_label: string
}

type SpeakerProfileRow = {
  id: number
  name: string
  color: string
  created_at: string
  recording_count: number | null
  total_duration: number | null
}

type UnembeddedSegmentRow = {
  recording_id: number
  recording_title: string
  segment_id: number
  text: string
  start_time: number
  speaker_name: string | null
}

type SearchHistoryRow = {
  id: number
  query: string
  result_count: number
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
        title, duration, audio_path, category, tags, is_bookmarked, is_archived, file_size_bytes, template_id, classification_confidence, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, NULL, NULL, datetime('now'), datetime('now'))
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
            , template_id, classification_confidence
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
            , template_id, classification_confidence
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
    const nextTemplateId = input.templateId ?? existing.templateId ?? null
    const nextClassificationConfidence =
      typeof input.classificationConfidence === 'number'
        ? input.classificationConfidence
        : existing.classificationConfidence ?? null

    this.db
      .prepare(
        `
      UPDATE recordings
      SET title = ?, category = ?, tags = ?, is_bookmarked = ?, is_archived = ?, template_id = ?, classification_confidence = ?, updated_at = datetime('now')
      WHERE id = ?
    `
      )
      .run(
        nextTitle,
        nextCategory,
        JSON.stringify(nextTags),
        nextBookmarked,
        nextArchived,
        nextTemplateId,
        nextClassificationConfidence,
        id
      )
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

  public listUnembeddedTranscriptSegments(): Array<{
    recordingId: number
    recordingTitle: string
    segmentId: number
    text: string
    timestamp: number
    speaker?: string
  }> {
    const rows = this.db
      .prepare(
        `
      SELECT
        ts.recording_id,
        r.title AS recording_title,
        ts.id AS segment_id,
        ts.text,
        ts.start_time,
        sp.name AS speaker_name
      FROM transcript_segments ts
      JOIN recordings r ON r.id = ts.recording_id
      LEFT JOIN speaker_profiles sp ON sp.id = ts.speaker_profile_id
      WHERE NOT EXISTS (
        SELECT 1 FROM vector_documents vd WHERE vd.segment_id = ts.id
      )
      ORDER BY ts.recording_id ASC, ts.start_time ASC
    `
      )
      .all() as UnembeddedSegmentRow[]
    return rows.map((row) => ({
      recordingId: row.recording_id,
      recordingTitle: row.recording_title,
      segmentId: row.segment_id,
      text: row.text,
      timestamp: row.start_time,
      speaker: row.speaker_name ?? undefined
    }))
  }

  public saveSearchHistory(query: string, resultCount: number): number {
    const result = this.db
      .prepare('INSERT INTO search_history (query, result_count) VALUES (?, ?)')
      .run(query, resultCount)
    return Number(result.lastInsertRowid)
  }

  public setRecordingClassification(
    recordingId: number,
    templateId: string,
    classificationConfidence: number
  ): Recording | null {
    const existing = this.getRecording(recordingId)
    if (!existing) return null
    this.db
      .prepare(
        `
      UPDATE recordings
      SET template_id = ?, classification_confidence = ?, updated_at = datetime('now')
      WHERE id = ?
    `
      )
      .run(templateId, classificationConfidence, recordingId)
    return this.getRecording(recordingId)
  }

  public listSearchHistory(limit = 20): SearchHistoryEntry[] {
    const rows = this.db
      .prepare(
        `
      SELECT id, query, result_count, created_at
      FROM search_history
      ORDER BY created_at DESC
      LIMIT ?
    `
      )
      .all(limit) as SearchHistoryRow[]
    return rows.map((row) => ({
      id: row.id,
      query: row.query,
      resultCount: row.result_count,
      createdAt: row.created_at
    }))
  }

  public listTranscriptSegments(recordingId: number): TranscriptSegment[] {
    const rows = this.db
      .prepare(
        `
      SELECT
        ts.id,
        ts.recording_id,
        ts.text,
        ts.start_time,
        ts.end_time,
        ts.language,
        ts.confidence,
        ts.words_json,
        ts.speaker_profile_id,
        sp.name AS speaker_name,
        sp.color AS speaker_color
      FROM transcript_segments ts
      LEFT JOIN speaker_profiles sp ON sp.id = ts.speaker_profile_id
      WHERE ts.recording_id = ?
      ORDER BY ts.start_time ASC, ts.id ASC
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
      words: row.words_json ? (JSON.parse(row.words_json) as TranscriptSegment['words']) : undefined,
      speakerProfileId: row.speaker_profile_id,
      speakerName: row.speaker_name ?? undefined,
      speakerColor: row.speaker_color ?? undefined
    }))
  }

  public insertSpeakerSegments(recordingId: number, segments: SpeakerSegment[]): number {
    if (segments.length === 0) return 0
    const insert = this.db.prepare(`
      INSERT INTO speaker_segments (
        recording_id, speaker_profile_id, start_time, end_time, confidence, raw_speaker_label
      ) VALUES (?, ?, ?, ?, ?, ?)
    `)
    const tx = this.db.transaction((items: SpeakerSegment[]) => {
      for (const item of items) {
        insert.run(
          recordingId,
          item.speakerProfileId ?? null,
          item.start,
          item.end,
          item.confidence,
          item.speaker
        )
      }
    })
    tx(segments)
    return segments.length
  }

  public listSpeakerSegments(recordingId: number): SpeakerSegment[] {
    const rows = this.db
      .prepare(
        `
      SELECT id, recording_id, speaker_profile_id, start_time, end_time, confidence, raw_speaker_label
      FROM speaker_segments
      WHERE recording_id = ?
      ORDER BY start_time ASC, id ASC
    `
      )
      .all(recordingId) as SpeakerSegmentRow[]
    return rows.map((row) => ({
      id: row.id,
      recordingId: row.recording_id,
      speakerProfileId: row.speaker_profile_id,
      start: row.start_time,
      end: row.end_time,
      confidence: row.confidence,
      speaker: row.raw_speaker_label
    }))
  }

  public assignTranscriptSpeakers(
    recordingId: number,
    alignedSegments: Array<Pick<TranscriptSegment, 'id' | 'speaker' | 'speakerProfileId'>>
  ): number {
    if (alignedSegments.length === 0) return 0
    const update = this.db.prepare(`
      UPDATE transcript_segments
      SET speaker_profile_id = ?
      WHERE id = ? AND recording_id = ?
    `)
    const tx = this.db.transaction((items: Array<Pick<TranscriptSegment, 'id' | 'speakerProfileId'>>) => {
      for (const item of items) {
        if (!item.id) continue
        update.run(item.speakerProfileId ?? null, item.id, recordingId)
      }
    })
    tx(alignedSegments)
    return alignedSegments.length
  }

  public createSpeakerProfile(name: string, color: string, embedding?: Float32Array): SpeakerProfile {
    const result = this.db
      .prepare(
        `
      INSERT INTO speaker_profiles (name, color, embedding, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `
      )
      .run(name, color, embedding ? Buffer.from(embedding.buffer) : null)
    const created = this.getSpeakerProfile(Number(result.lastInsertRowid))
    if (!created) {
      throw new Error('Failed to create speaker profile')
    }
    return created
  }

  public getSpeakerProfile(id: number): SpeakerProfile | null {
    const row = this.db
      .prepare(
        `
      SELECT
        sp.id,
        sp.name,
        sp.color,
        sp.created_at,
        COUNT(DISTINCT ss.recording_id) AS recording_count,
        SUM(ss.end_time - ss.start_time) AS total_duration
      FROM speaker_profiles sp
      LEFT JOIN speaker_segments ss ON ss.speaker_profile_id = sp.id
      WHERE sp.id = ?
      GROUP BY sp.id
    `
      )
      .get(id) as SpeakerProfileRow | undefined
    if (!row) return null
    return this.mapSpeakerProfile(row)
  }

  public listSpeakerProfiles(): SpeakerProfile[] {
    const rows = this.db
      .prepare(
        `
      SELECT
        sp.id,
        sp.name,
        sp.color,
        sp.created_at,
        COUNT(DISTINCT ss.recording_id) AS recording_count,
        SUM(ss.end_time - ss.start_time) AS total_duration
      FROM speaker_profiles sp
      LEFT JOIN speaker_segments ss ON ss.speaker_profile_id = sp.id
      GROUP BY sp.id
      ORDER BY sp.created_at DESC
    `
      )
      .all() as SpeakerProfileRow[]
    return rows.map(this.mapSpeakerProfile)
  }

  public updateSpeakerProfile(id: number, updates: { name?: string; color?: string }): SpeakerProfile | null {
    const existing = this.getSpeakerProfile(id)
    if (!existing) return null
    const nextName = updates.name ?? existing.name
    const nextColor = updates.color ?? existing.color
    this.db
      .prepare("UPDATE speaker_profiles SET name = ?, color = ?, updated_at = datetime('now') WHERE id = ?")
      .run(nextName, nextColor, id)
    return this.getSpeakerProfile(id)
  }

  public mergeSpeakerProfiles(sourceId: number, targetId: number): boolean {
    const source = this.getSpeakerProfile(sourceId)
    const target = this.getSpeakerProfile(targetId)
    if (!source || !target || sourceId === targetId) return false
    const tx = this.db.transaction(() => {
      this.db
        .prepare('UPDATE speaker_segments SET speaker_profile_id = ? WHERE speaker_profile_id = ?')
        .run(targetId, sourceId)
      this.db
        .prepare('UPDATE transcript_segments SET speaker_profile_id = ? WHERE speaker_profile_id = ?')
        .run(targetId, sourceId)
      this.db.prepare('DELETE FROM speaker_profiles WHERE id = ?').run(sourceId)
    })
    tx()
    return true
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

  public getConnection(): Database.Database {
    return this.db
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
      // SQLite ALTER TABLE implicitly commits transactions, making transaction
      // wrappers unsafe for migrations containing ALTER TABLE statements.
      // Execute each statement individually and update version after all succeed.
      const statements = migration.sql
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
      const hasAlterTable = statements.some((s) => /^\s*ALTER\s+TABLE/i.test(s))

      if (hasAlterTable) {
        // Run ALTER TABLEs outside transaction (they auto-commit anyway)
        for (const stmt of statements) {
          this.db.exec(stmt)
        }
        this.db.pragma(`user_version = ${migration.id}`)
      } else {
        // Safe to wrap in transaction for non-ALTER migrations
        this.db.transaction(() => {
          this.db.exec(migration.sql)
          this.db.pragma(`user_version = ${migration.id}`)
        })()
      }
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
    if (!names.has('template_id')) {
      statements.push('ALTER TABLE recordings ADD COLUMN template_id TEXT')
    }
    if (!names.has('classification_confidence')) {
      statements.push('ALTER TABLE recordings ADD COLUMN classification_confidence REAL')
    }
    const transcriptColumns = this.db
      .prepare(`SELECT name FROM pragma_table_info('transcript_segments')`)
      .all() as Array<{ name: string }>
    const transcriptNames = new Set(transcriptColumns.map((entry) => entry.name))
    if (!transcriptNames.has('speaker_profile_id')) {
      statements.push(
        'ALTER TABLE transcript_segments ADD COLUMN speaker_profile_id INTEGER REFERENCES speaker_profiles(id)'
      )
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
      fileSizeBytes: row.file_size_bytes,
      templateId: row.template_id ?? undefined,
      classificationConfidence: row.classification_confidence ?? undefined
    }
  }

  private readonly mapSpeakerProfile = (row: SpeakerProfileRow): SpeakerProfile => {
    return {
      id: row.id,
      name: row.name,
      color: row.color,
      createdAt: row.created_at,
      recordingCount: row.recording_count ?? 0,
      totalDuration: row.total_duration ?? 0
    }
  }
}
