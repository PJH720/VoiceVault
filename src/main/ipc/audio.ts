import { ipcMain, systemPreferences } from 'electron'
import path from 'node:path'
import { AudioChannels } from '../../shared/ipc-channels'
import type { RecordingResult } from '../../shared/types'
import { AudioCaptureService } from '../services/AudioCaptureService'
import { DatabaseService } from '../services/DatabaseService'

type TranscriptionBridge = {
  onAudioChunk: (chunk: Buffer, sampleRate: number, startedAtMs: number) => void
}

export function registerAudioHandlers(
  audioService: AudioCaptureService,
  databaseService: DatabaseService,
  transcriptionBridge?: TranscriptionBridge
): void {
  let stopChunkListener: (() => void) | null = null

  ipcMain.handle(AudioChannels.REQUEST_PERMISSION, async () => {
    if (process.platform !== 'darwin') return true
    return systemPreferences.askForMediaAccess('microphone')
  })

  ipcMain.handle(AudioChannels.START_RECORDING, async () => {
    const recordingsDir = path.join(process.env.VOICEVAULT_USER_DATA_PATH ?? '', 'recordings')
    const audioPath = await audioService.startRecording(recordingsDir)
    stopChunkListener?.()
    if (transcriptionBridge) {
      stopChunkListener = audioService.onAudioChunk((chunk, sampleRate) => {
        transcriptionBridge.onAudioChunk(chunk, sampleRate, audioService.recordingStartedAt)
      })
    }
    return {
      streamId: path.basename(audioPath),
      audioPath
    }
  })

  ipcMain.handle(AudioChannels.STOP_RECORDING, async () => {
    stopChunkListener?.()
    stopChunkListener = null
    const result = await audioService.stopRecording()
    const id = databaseService.insertRecording({
      title: `Recording ${new Date().toLocaleString()}`,
      audioPath: result.audioPath,
      duration: result.duration,
      fileSizeBytes: result.fileSizeBytes
    })

    const payload: RecordingResult = {
      id,
      audioPath: result.audioPath,
      duration: result.duration,
      fileSizeBytes: result.fileSizeBytes
    }

    return payload
  })
}
