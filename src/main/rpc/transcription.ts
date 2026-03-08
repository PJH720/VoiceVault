import { WhisperChannels } from '../../shared/ipc-channels'
import type { TranscriptSegment, WhisperModelSize } from '../../shared/types'
import { ServiceRegistry } from '../services/registry'
import { getDb } from '../services/db'
import { getWhisperModel } from '../services/settings'

let bufferedSegments: TranscriptSegment[] = []

export const transcriptionRPCHandlers = {
  [WhisperChannels.START_STREAM]: async (): Promise<{ success: boolean }> => {
    bufferedSegments = []
    // In Electrobun, streaming transcription uses the subprocess approach.
    // The whisper binary will be spawned when audio chunks are ready.
    return { success: true }
  },

  [WhisperChannels.STOP]: async (): Promise<{ success: boolean; segmentCount: number }> => {
    return { success: true, segmentCount: bufferedSegments.length }
  },

  [WhisperChannels.TRANSCRIBE_FILE]: async (params: {
    audioPath: string
    modelSize?: WhisperModelSize
  }): Promise<TranscriptSegment[]> => {
    const whisper = ServiceRegistry.getWhisperSubprocess()
    const modelSize = params.modelSize ?? getWhisperModel()
    const modelPath = `ggml-${modelSize}.bin`
    return whisper.transcribeFile(params.audioPath, modelPath)
  },

  [WhisperChannels.DOWNLOAD_MODEL]: async (params: {
    modelSize?: WhisperModelSize
  }): Promise<{ success: boolean }> => {
    const whisper = ServiceRegistry.getWhisperSubprocess()
    const size = params.modelSize ?? getWhisperModel()
    await whisper.downloadModel(size)
    return { success: true }
  },

  [WhisperChannels.MODEL_STATUS]: async (params?: {
    modelSize?: WhisperModelSize
  }): Promise<{ modelSize: WhisperModelSize; available: boolean }> => {
    const { existsSync } = await import('fs')
    const { join } = await import('path')
    const { getUserDataPath } = await import('../types')

    const requested = params?.modelSize ?? getWhisperModel()
    const modelPath = join(getUserDataPath(), 'models', `ggml-${requested}.bin`)
    return { modelSize: requested, available: existsSync(modelPath) }
  },

  [WhisperChannels.BINARY_STATUS]: async (): Promise<{ available: boolean; path: string }> => {
    const whisper = ServiceRegistry.getWhisperSubprocess()
    return whisper.getBinaryStatus()
  },

  [WhisperChannels.SAVE_SEGMENTS]: (params: {
    recordingId: number
    segments?: TranscriptSegment[]
  }): { inserted: number } => {
    if (typeof params.recordingId !== 'number' || !Number.isFinite(params.recordingId)) {
      throw new Error('Invalid recordingId')
    }
    const db = getDb()
    const source =
      params.segments && params.segments.length > 0 ? params.segments : bufferedSegments

    if (source.length === 0) return { inserted: 0 }

    const insert = db.query(
      `INSERT INTO transcript_segments (recording_id, text, start_time, end_time, language, confidence, words_json) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    const tx = db.transaction(() => {
      for (const seg of source) {
        insert.run(
          params.recordingId,
          seg.text,
          seg.start,
          seg.end,
          seg.language,
          seg.confidence,
          seg.words ? JSON.stringify(seg.words) : null
        )
      }
    })
    tx()
    bufferedSegments = []
    return { inserted: source.length }
  },

  [WhisperChannels.LIST_SEGMENTS]: (params: {
    recordingId: number
  }): TranscriptSegment[] => {
    if (typeof params.recordingId !== 'number' || !Number.isFinite(params.recordingId)) {
      throw new Error('Invalid recordingId')
    }
    const db = getDb()
    const rows = db
      .query(
        `SELECT ts.id, ts.recording_id, ts.text, ts.start_time, ts.end_time, ts.language, ts.confidence, ts.words_json, ts.speaker_profile_id, sp.name AS speaker_name, sp.color AS speaker_color FROM transcript_segments ts LEFT JOIN speaker_profiles sp ON sp.id = ts.speaker_profile_id WHERE ts.recording_id = ? ORDER BY ts.start_time ASC, ts.id ASC`
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
      speakerColor: (row.speaker_color as string | null) ?? undefined
    }))
  }
}
