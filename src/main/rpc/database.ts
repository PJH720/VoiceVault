import { existsSync, unlinkSync, statSync } from 'fs'
import { DatabaseChannels } from '../../shared/ipc-channels'
import type { ListOptions, Recording, RecordingWithTranscript } from '../../shared/types'
import { getDb } from '../services/db'

const RECORDING_COLS =
  'id, title, duration, audio_path, created_at, updated_at, category, tags, ' +
  'is_bookmarked, is_archived, file_size_bytes, template_id, classification_confidence'

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

function mapRow(row: RecordingRow): Recording {
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

export const databaseRPCHandlers = {
  [DatabaseChannels.LIST]: (params?: { options?: ListOptions }): Recording[] => {
    const db = getDb()
    const options = params?.options ?? {}
    const sortByMap: Record<string, string> = {
      createdAt: 'created_at',
      duration: 'duration',
      title: 'title COLLATE NOCASE'
    }
    const sortBy = options.sortBy ?? 'createdAt'
    const sortOrder = options.sortOrder ?? 'DESC'
    const includeArchived = options.includeArchived ?? false
    const where: string[] = []
    const sqlParams: Array<string | number> = []

    if (!includeArchived) where.push('is_archived = 0')
    if (options.category) {
      where.push('category = ?')
      sqlParams.push(options.category)
    }
    if (options.search?.trim()) {
      const raw = options.search.trim()
      const ftsEscaped = '"' + raw.replace(/"/g, '""') + '"'
      where.push(
        `(title LIKE ? OR id IN (SELECT recording_id FROM transcript_segments_fts WHERE transcript_segments_fts MATCH ?))`
      )
      sqlParams.push(`%${raw}%`, ftsEscaped)
    }

    let sql = `SELECT ${RECORDING_COLS} FROM recordings`
    if (where.length > 0) sql += ` WHERE ${where.join(' AND ')}`
    sql += ` ORDER BY ${sortByMap[sortBy] ?? 'created_at'} ${sortOrder}`
    if (typeof options.limit === 'number' && options.limit > 0) {
      sql += ' LIMIT ?'
      sqlParams.push(options.limit)
    }
    if (typeof options.offset === 'number' && options.offset >= 0) {
      sql += ' OFFSET ?'
      sqlParams.push(options.offset)
    }

    const rows = db.query(sql).all(...sqlParams) as RecordingRow[]
    return rows.map(mapRow)
  },

  [DatabaseChannels.GET]: (params: { id: number }): RecordingWithTranscript | null => {
    const db = getDb()
    const row = db
      .query(
        `SELECT ${RECORDING_COLS} FROM recordings WHERE id = ? AND is_archived = 0`
      )
      .get(params.id) as RecordingRow | undefined
    if (!row) return null
    const recording = mapRow(row)

    const segmentRows = db
      .query(
        `SELECT ts.id, ts.recording_id, ts.text, ts.start_time, ts.end_time, ts.language, ts.confidence, ts.words_json, ts.speaker_profile_id, sp.name AS speaker_name, sp.color AS speaker_color FROM transcript_segments ts LEFT JOIN speaker_profiles sp ON sp.id = ts.speaker_profile_id WHERE ts.recording_id = ? ORDER BY ts.start_time ASC, ts.id ASC`
      )
      .all(params.id) as Array<Record<string, unknown>>

    const segments = segmentRows.map((s) => ({
      id: s.id as number,
      recordingId: s.recording_id as number,
      text: s.text as string,
      start: s.start_time as number,
      end: s.end_time as number,
      language: s.language as string,
      confidence: s.confidence as number,
      words: s.words_json ? (JSON.parse(s.words_json as string) as unknown) : undefined,
      speakerProfileId: (s.speaker_profile_id as number | null) ?? undefined,
      speakerName: (s.speaker_name as string | null) ?? undefined,
      speakerColor: (s.speaker_color as string | null) ?? undefined
    }))

    return { ...recording, segments } as RecordingWithTranscript
  },

  [DatabaseChannels.CREATE]: (params: {
    title: string
    duration: number
    audioPath: string
  }): Recording | null => {
    const db = getDb()
    const fileSizeBytes = existsSync(params.audioPath) ? statSync(params.audioPath).size : 0
    const { lastInsertRowid } = db.query(
      `INSERT INTO recordings (title, duration, audio_path, category, tags, is_bookmarked, is_archived, file_size_bytes, template_id, classification_confidence, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, 0, 0, ?, NULL, NULL, datetime('now'), datetime('now'))`
    ).run(params.title, params.duration, params.audioPath, fileSizeBytes)

    return databaseRPCHandlers[DatabaseChannels.GET]({ id: Number(lastInsertRowid) })
  },

  [DatabaseChannels.SEARCH]: (params: { query: string; options?: ListOptions }): Recording[] => {
    return databaseRPCHandlers[DatabaseChannels.LIST]({
      options: { ...params.options, search: params.query }
    })
  },

  [DatabaseChannels.UPDATE]: (params: {
    id: number
    data: Partial<Recording>
  }): Recording | null => {
    const db = getDb()
    const existing = databaseRPCHandlers[DatabaseChannels.GET]({ id: params.id })
    if (!existing) return null

    const data = params.data
    db.query(
      `UPDATE recordings SET title = ?, category = ?, is_bookmarked = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(
      data.title ?? existing.title,
      data.category ?? existing.category ?? null,
      data.isBookmarked !== undefined ? Number(data.isBookmarked) : Number(existing.isBookmarked),
      params.id
    )
    return (databaseRPCHandlers[DatabaseChannels.GET]({ id: params.id }) as Recording | null)
  },

  [DatabaseChannels.DELETE]: (params: { id: number; hard?: boolean }): Recording | null => {
    const db = getDb()
    const existing = databaseRPCHandlers[DatabaseChannels.GET]({ id: params.id })
    if (!existing) return null

    if (params.hard) {
      db.query('DELETE FROM recordings WHERE id = ?').run(params.id)
      if (existing.audioPath && existsSync(existing.audioPath)) {
        unlinkSync(existing.audioPath)
      }
    } else {
      db.query("UPDATE recordings SET is_archived = 1, updated_at = datetime('now') WHERE id = ?").run(
        params.id
      )
    }
    return existing
  }
}
