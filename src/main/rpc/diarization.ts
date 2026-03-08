import { DiarizationChannels } from '../../shared/ipc-channels'
import type { SpeakerProfile, SpeakerSegment, TranscriptSegment } from '../../shared/types'
import { getDb } from '../services/db'
import { assertFiniteId } from '../utils/validate'

// Shared row → SpeakerSegment mapper — used by ALIGN_TRANSCRIPT and LIST_SPEAKER_SEGMENTS
function mapSpeakerSegment(row: Record<string, unknown>): SpeakerSegment {
  return {
    id: row.id as number,
    recordingId: row.recording_id as number,
    speakerProfileId: row.speaker_profile_id as number | null,
    start: row.start_time as number,
    end: row.end_time as number,
    confidence: row.confidence as number,
    speaker: row.raw_speaker_label as string,
  }
}

const SPEAKER_SEGMENTS_SQL =
  `SELECT id, recording_id, speaker_profile_id, start_time, end_time, confidence, raw_speaker_label
   FROM speaker_segments WHERE recording_id = ? ORDER BY start_time ASC`

export const diarizationRPCHandlers = {
  [DiarizationChannels.PROCESS]: async (params: {
    audioPath: string
    recordingId: number
  }): Promise<{ success: boolean; segments: SpeakerSegment[] }> => {
    // Diarization requires pyannote-cpp-node (native dep not available in Electrobun).
    // This will be implemented via Bun.spawn with a Python subprocess or alternative binary.
    throw new Error('Diarization not yet implemented for Electrobun — requires subprocess wrapper')
  },

  [DiarizationChannels.ALIGN_TRANSCRIPT]: (params: {
    recordingId: number
    transcriptSegments: TranscriptSegment[]
    speakerSegments?: SpeakerSegment[]
  }): TranscriptSegment[] => {
    assertFiniteId(params.recordingId, 'recordingId')
    if (!Array.isArray(params.transcriptSegments)) {
      throw new Error('transcriptSegments must be an array')
    }

    const db = getDb()
    const sourceSegments =
      params.speakerSegments ??
      (db
        .query(
          'SELECT id, recording_id, speaker_profile_id, start_time, end_time, confidence, raw_speaker_label FROM speaker_segments WHERE recording_id = ? ORDER BY start_time ASC'
        )
        .all(params.recordingId) as Array<Record<string, unknown>>
      ).map((row) => ({
        id: row.id as number,
        recordingId: row.recording_id as number,
        speakerProfileId: row.speaker_profile_id as number | null,
        start: row.start_time as number,
        end: row.end_time as number,
        confidence: row.confidence as number,
        speaker: row.raw_speaker_label as string
      }))

    // Simple alignment: assign speaker based on time overlap
    const aligned = params.transcriptSegments.map((ts) => {
      const midpoint = (ts.start + ts.end) / 2
      const match = sourceSegments.find((ss) => midpoint >= ss.start && midpoint <= ss.end)
      return {
        ...ts,
        speaker: match?.speaker,
        speakerProfileId: match?.speakerProfileId
      }
    })

    // Persist assignments
    const update = db.query(
      'UPDATE transcript_segments SET speaker_profile_id = ? WHERE id = ? AND recording_id = ?'
    )
    const tx = db.transaction(() => {
      for (const seg of aligned) {
        if (!seg.id) continue
        update.run(seg.speakerProfileId ?? null, seg.id, params.recordingId)
      }
    })
    tx()

    return aligned
  },

  [DiarizationChannels.LIST_SPEAKER_SEGMENTS]: (params: {
    recordingId: number
  }): SpeakerSegment[] => {
    assertFiniteId(params.recordingId, 'recordingId')
    const db = getDb()
    return (db.query(SPEAKER_SEGMENTS_SQL).all(params.recordingId) as Array<Record<string, unknown>>).map(mapSpeakerSegment)
  },

  [DiarizationChannels.LIST_SPEAKERS]: (): SpeakerProfile[] => {
    const db = getDb()
    const rows = db
      .query(
        `SELECT sp.id, sp.name, sp.color, sp.created_at, COUNT(DISTINCT ss.recording_id) AS recording_count, SUM(ss.end_time - ss.start_time) AS total_duration FROM speaker_profiles sp LEFT JOIN speaker_segments ss ON ss.speaker_profile_id = sp.id GROUP BY sp.id ORDER BY sp.created_at DESC`
      )
      .all() as Array<Record<string, unknown>>

    return rows.map((row) => ({
      id: row.id as number,
      name: row.name as string,
      color: row.color as string,
      createdAt: row.created_at as string,
      recordingCount: (row.recording_count as number) ?? 0,
      totalDuration: (row.total_duration as number) ?? 0
    }))
  },

  [DiarizationChannels.CREATE_SPEAKER]: (params: { name: string }): SpeakerProfile => {
    const db = getDb()
    const colors = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899']
    const color = colors[Math.floor(Math.random() * colors.length)]

    db.query(
      `INSERT INTO speaker_profiles (name, color, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))`
    ).run(params.name, color)

    const lastId = db.query('SELECT last_insert_rowid() as id').get() as { id: number }
    return {
      id: lastId.id,
      name: params.name,
      color,
      createdAt: new Date().toISOString(),
      recordingCount: 0,
      totalDuration: 0
    }
  },

  [DiarizationChannels.UPDATE_SPEAKER]: (params: {
    id: number
    updates: { name?: string; color?: string }
  }): SpeakerProfile | null => {
    const db = getDb()
    const existing = db
      .query('SELECT id, name, color, created_at FROM speaker_profiles WHERE id = ?')
      .get(params.id) as Record<string, unknown> | undefined
    if (!existing) return null

    const name = params.updates.name ?? (existing.name as string)
    const color = params.updates.color ?? (existing.color as string)
    db.query("UPDATE speaker_profiles SET name = ?, color = ?, updated_at = datetime('now') WHERE id = ?").run(
      name,
      color,
      params.id
    )

    return {
      id: params.id,
      name,
      color,
      createdAt: existing.created_at as string,
      recordingCount: 0,
      totalDuration: 0
    }
  },

  [DiarizationChannels.MERGE_SPEAKERS]: (params: {
    sourceId: number
    targetId: number
  }): { success: boolean } => {
    const db = getDb()
    if (params.sourceId === params.targetId) return { success: false }

    const tx = db.transaction(() => {
      db.query('UPDATE speaker_segments SET speaker_profile_id = ? WHERE speaker_profile_id = ?').run(
        params.targetId,
        params.sourceId
      )
      db.query('UPDATE transcript_segments SET speaker_profile_id = ? WHERE speaker_profile_id = ?').run(
        params.targetId,
        params.sourceId
      )
      db.query('DELETE FROM speaker_profiles WHERE id = ?').run(params.sourceId)
    })
    tx()
    return { success: true }
  }
}
