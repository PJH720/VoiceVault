import { existsSync } from 'fs'
import { join } from 'path'
import { WhisperChannels } from '../../shared/ipc-channels'
import type { TranscriptSegment, WhisperModelSize } from '../../shared/types'
import { ServiceRegistry } from '../services/registry'
import { getDb } from '../services/db'
import { getWhisperModel } from '../services/settings'
import { getUserDataPath } from '../types'
import { assertFiniteId } from '../utils/validate'

let bufferedSegments: TranscriptSegment[] = []

export const transcriptionRPCHandlers = {
  [WhisperChannels.START_STREAM]: async (): Promise<{ success: boolean }> => {
    bufferedSegments = []
    return { success: true }
  },

  [WhisperChannels.STOP]: async (): Promise<{ success: boolean; segmentCount: number }> => {
    return { success: true, segmentCount: bufferedSegments.length }
  },

  [WhisperChannels.TRANSCRIBE_FILE]: async (params: {
    audioPath: string
    modelSize?: WhisperModelSize
  }): Promise<TranscriptSegment[]> => {
    const modelSize = params.modelSize ?? getWhisperModel()
    return ServiceRegistry.getWhisperSubprocess().transcribeFile(
      params.audioPath,
      `ggml-${modelSize}.bin`,
    )
  },

  [WhisperChannels.DOWNLOAD_MODEL]: async (params: {
    modelSize?: WhisperModelSize
  }): Promise<{ success: boolean }> => {
    await ServiceRegistry.getWhisperSubprocess().downloadModel(
      params.modelSize ?? getWhisperModel(),
    )
    return { success: true }
  },

  [WhisperChannels.MODEL_STATUS]: (params?: {
    modelSize?: WhisperModelSize
  }): { modelSize: WhisperModelSize; available: boolean } => {
    const requested = params?.modelSize ?? getWhisperModel()
    const modelPath = join(getUserDataPath(), 'models', `ggml-${requested}.bin`)
    return { modelSize: requested, available: existsSync(modelPath) }
  },

  [WhisperChannels.BINARY_STATUS]: async (): Promise<{ available: boolean; path: string }> => {
    return ServiceRegistry.getWhisperSubprocess().getBinaryStatus()
  },

  [WhisperChannels.SAVE_SEGMENTS]: (params: {
    recordingId: number
    segments?: TranscriptSegment[]
  }): { inserted: number } => {
    assertFiniteId(params.recordingId, 'recordingId')
    const source = params.segments?.length ? params.segments : bufferedSegments
    if (source.length === 0) return { inserted: 0 }

    const db = getDb()
    const insert = db.query(
      `INSERT INTO transcript_segments
         (recording_id, text, start_time, end_time, language, confidence, words_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    db.transaction(() => {
      for (const seg of source) {
        insert.run(
          params.recordingId, seg.text, seg.start, seg.end,
          seg.language, seg.confidence,
          seg.words ? JSON.stringify(seg.words) : null,
        )
      }
    })()
    bufferedSegments = []
    return { inserted: source.length }
  },

  [WhisperChannels.LIST_SEGMENTS]: (params: { recordingId: number }): TranscriptSegment[] => {
    assertFiniteId(params.recordingId, 'recordingId')
    const db = getDb()
    const rows = db
      .query(
        `SELECT ts.id, ts.recording_id, ts.text, ts.start_time, ts.end_time, ts.language,
                ts.confidence, ts.words_json, ts.speaker_profile_id,
                sp.name AS speaker_name, sp.color AS speaker_color
         FROM transcript_segments ts
         LEFT JOIN speaker_profiles sp ON sp.id = ts.speaker_profile_id
         WHERE ts.recording_id = ?
         ORDER BY ts.start_time ASC, ts.id ASC`
      )
      .all(params.recordingId) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      id: row.id as number,
      recordingId: row.recording_id as number,
      text: row.text as string,
      start: row.start_time as number,
      end: row.end_time as number,
      language: row.language as string,
      confidence: row.confidence as number,
      words: row.words_json
        ? (JSON.parse(row.words_json as string) as TranscriptSegment['words'])
        : undefined,
      speakerProfileId: (row.speaker_profile_id as number | null) ?? undefined,
      speakerName: (row.speaker_name as string | null) ?? undefined,
      speakerColor: (row.speaker_color as string | null) ?? undefined,
    }))
  },
}
