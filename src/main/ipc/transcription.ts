import { BrowserWindow, ipcMain } from 'electron'
import { WhisperChannels } from '../../shared/ipc-channels'
import type { TranscriptSegment, WhisperModelSize } from '../../shared/types'
import { getWhisperModel, setWhisperModel } from '../store'
import { DatabaseService } from '../services/DatabaseService'
import { WhisperService } from '../services/WhisperService'
import { registerShutdownCallback } from '../index'

type TranscriptionRuntime = {
  onAudioChunk: (chunk: Buffer, sampleRate: number, startedAtMs: number) => void
}

export function registerTranscriptionHandlers(
  mainWindow: BrowserWindow,
  databaseService: DatabaseService
): TranscriptionRuntime {
  const whisperService = new WhisperService(getWhisperModel())
  registerShutdownCallback('WhisperService', () => whisperService.destroy())
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

  ipcMain.handle(WhisperChannels.SET_MODEL, async (_event, modelSize: WhisperModelSize) => {
    setWhisperModel(modelSize)
    whisperService.setModelSize(modelSize)
    return { modelSize }
  })

  ipcMain.handle(WhisperChannels.GET_MODEL, () => {
    return {
      modelSize: whisperService.getModelSize(),
      supported: whisperService.listSupportedModels()
    }
  })

  ipcMain.handle(WhisperChannels.SAVE_SEGMENTS, (_event, recordingId: number, segments?: TranscriptSegment[]) => {
    const source = segments && segments.length > 0 ? segments : bufferedSegments
    const inserted = databaseService.insertTranscriptSegments(recordingId, source)
    bufferedSegments = []
    return { inserted }
  })

  ipcMain.handle(WhisperChannels.LIST_SEGMENTS, (_event, recordingId: number) => {
    return databaseService.listTranscriptSegments(recordingId)
  })

  return {
    onAudioChunk
  }
}
