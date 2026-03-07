import { join } from 'path'
import { AudioChannels } from '../../shared/ipc-channels'
import type { RecordingResult } from '../../shared/types'
import { getUserDataPath } from '../types'

// Audio capture state (managed by the RPC handler, not a service class)
let isRecording = false
let recordingStartedAt = 0

/**
 * Audio RPC handlers — ports src/main/ipc/audio.ts
 *
 * NOTE: AudioCaptureService in Electron uses native Node.js APIs.
 * In Electrobun, audio capture will use Bun.spawn with a system audio recorder
 * or the Web Audio API in the renderer. This is a scaffold with the interface intact.
 */
export const audioRPCHandlers = {
  [AudioChannels.REQUEST_PERMISSION]: async (): Promise<boolean> => {
    // In Electrobun, permission requests are handled by the system webview
    return true
  },

  [AudioChannels.START_RECORDING]: async (): Promise<{ streamId: string; audioPath: string }> => {
    const recordingsDir = join(getUserDataPath(), 'recordings')
    const { mkdirSync } = await import('fs')
    mkdirSync(recordingsDir, { recursive: true })

    const filename = `recording_${Date.now()}.wav`
    const audioPath = join(recordingsDir, filename)
    isRecording = true
    recordingStartedAt = Date.now()

    // TODO: Implement actual audio capture via Bun.spawn or renderer bridge
    return { streamId: filename, audioPath }
  },

  [AudioChannels.STOP_RECORDING]: async (): Promise<RecordingResult> => {
    isRecording = false
    const duration = (Date.now() - recordingStartedAt) / 1000

    // TODO: Stop actual capture, finalize WAV file, insert into DB
    return {
      id: 0,
      audioPath: '',
      duration,
      fileSizeBytes: 0
    }
  },

  [AudioChannels.CAPTURE_MODE]: async (): Promise<string> => {
    return 'microphone'
  }
}
