import { BrowserWindow, ipcMain } from 'electron'
import { WhisperChannels } from '../../shared/ipc-channels'
import type { TranscriptSegment, WhisperModelSize } from '../../shared/types'
import { DatabaseService } from '../services/DatabaseService'
import { ServiceRegistry } from '../services/ServiceRegistry'

type TranscriptionRuntime = {
  onAudioChunk: (chunk: Buffer, sampleRate: number, startedAtMs: number) => void
}

export function registerTranscriptionHandlers(
  mainWindow: BrowserWindow,
  databaseService: DatabaseService
): TranscriptionRuntime {
  const whisperService = ServiceRegistry.getWhisperService()
  let isStreaming = false
  let bufferedSegments: TranscriptSegment[] = []
  let sessionStartedAtMs = 0

  const emitSegment = (segment: TranscriptSegment): void => {
    mainWindow.webContents.send(WhisperChannels.ON_SEGMENT, segment)
  }

  const onAudioChunk = (chunk: Buffer, sampleRate: number, startedAtMs: number): void => {
    if (!isStreaming) return
    sessionStartedAtMs = sessionStartedAtMs || startedAtMs
    void whisperService
      .transcribeChunk(chunk, sampleRate, sessionStartedAtMs)
      .then((segments) => {
        if (!isStreaming || segments.length === 0) return
        for (const segment of segments) {
          bufferedSegments.push(segment)
          emitSegment(segment)
        }
      })
      .catch((error: unknown) => {
        mainWindow.webContents.send(WhisperChannels.ON_SEGMENT, {
          text: `[transcription-error] ${(error as Error).message}`,
          start: 0,
          end: 0,
          language: 'auto',
          confidence: 0
        } satisfies TranscriptSegment)
      })
  }

  ipcMain.handle(WhisperChannels.START_STREAM, async () => {
    isStreaming = true
    bufferedSegments = []
    sessionStartedAtMs = Date.now()
    if (!(await whisperService.isModelAvailable())) {
      throw new Error('Whisper model missing. Download required.')
    }
    await whisperService.initialize()
    return { success: true }
  })

  ipcMain.handle(WhisperChannels.STOP, async () => {
    isStreaming = false
    return { success: true, segmentCount: bufferedSegments.length }
  })

  ipcMain.handle(WhisperChannels.DOWNLOAD_MODEL, async (event, modelSize: WhisperModelSize) => {
    const VALID: string[] = ['base', 'small', 'medium', 'large-v3-turbo']
    if (modelSize != null && (typeof modelSize !== 'string' || !VALID.includes(modelSize))) {
      throw new Error(`Invalid model size "${modelSize}"`)
    }
    const size = modelSize ?? whisperService.getModelSize()
    await whisperService.downloadModel(size, (percent) => {
      event.sender.send(WhisperChannels.ON_DOWNLOAD_PROGRESS, {
        modelSize: size,
        percent
      })
    })
    return { success: true }
  })

  ipcMain.handle(WhisperChannels.MODEL_STATUS, async (_event, modelSize?: WhisperModelSize) => {
    const requested = modelSize ?? whisperService.getModelSize()
    const available = await whisperService.isModelAvailable(requested)
    return { modelSize: requested, available }
  })

  // Dead channels whisper:set-model and whisper:get-model removed (issue #214).
  // Use settings:set-whisper-model / settings:get-whisper-model instead.

  ipcMain.handle(
    WhisperChannels.SAVE_SEGMENTS,
    (_event, recordingId: number, segments?: TranscriptSegment[]) => {
      if (typeof recordingId !== 'number' || !Number.isFinite(recordingId)) {
        throw new Error('Invalid recordingId')
      }
      if (segments != null && !Array.isArray(segments)) {
        throw new Error('Segments must be an array')
      }
      const source = segments && segments.length > 0 ? segments : bufferedSegments
      const inserted = databaseService.insertTranscriptSegments(recordingId, source)
      bufferedSegments = []
      return { inserted }
    }
  )

  ipcMain.handle(WhisperChannels.LIST_SEGMENTS, (_event, recordingId: number) => {
    if (typeof recordingId !== 'number' || !Number.isFinite(recordingId)) {
      throw new Error('Invalid recordingId')
    }
    return databaseService.listTranscriptSegments(recordingId)
  })

  return {
    onAudioChunk
  }
}
