import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  AudioLevelEvent,
  LlmModelName,
  ListOptions,
  Recording,
  RecordingSummaryRow,
  RecordingWithTranscript,
  RecordingResult,
  SummaryOutput,
  SupportedLocale,
  TranscriptSegment,
  WhisperModelSize
} from '../shared/types'

type AppPathName =
  | 'home'
  | 'appData'
  | 'userData'
  | 'sessionData'
  | 'temp'
  | 'exe'
  | 'module'
  | 'desktop'
  | 'documents'
  | 'downloads'
  | 'music'
  | 'pictures'
  | 'videos'
  | 'recent'
  | 'logs'
  | 'crashDumps'

interface VoiceVaultApi {
  startRecording: () => Promise<{ streamId: string; audioPath: string }>
  stopRecording: () => Promise<RecordingResult>
  requestMicPermission: () => Promise<boolean>
  onAudioLevel: (callback: (event: AudioLevelEvent) => void) => () => void
  listRecordings: (options?: ListOptions) => Promise<Recording[]>
  getRecording: (id: number) => Promise<RecordingWithTranscript | null>
  createRecording: (title: string, duration: number, audioPath: string) => Promise<Recording | null>
  updateRecording: (id: number, data: Partial<Recording>) => Promise<Recording | null>
  deleteRecording: (id: number, hard?: boolean) => Promise<Recording | null>
  searchRecordings: (query: string, options?: ListOptions) => Promise<Recording[]>
  getAppPath: (name: AppPathName) => Promise<string>
  getVersion: () => Promise<string>
  getLocale: () => Promise<SupportedLocale>
  setLocale: (locale: SupportedLocale) => Promise<SupportedLocale>
  getWhisperModel: () => Promise<WhisperModelSize>
  setWhisperModel: (model: WhisperModelSize) => Promise<WhisperModelSize>
  getLlmModel: () => Promise<LlmModelName>
  setLlmModel: (model: LlmModelName) => Promise<LlmModelName>
  transcription: {
    start: () => Promise<{ success: boolean }>
    stop: () => Promise<{ success: boolean; segmentCount: number }>
    saveSegments: (recordingId: number, segments: TranscriptSegment[]) => Promise<{ inserted: number }>
    listSegments: (recordingId: number) => Promise<TranscriptSegment[]>
    downloadModel: (modelSize: WhisperModelSize) => Promise<{ success: boolean }>
    checkModel: (modelSize: WhisperModelSize) => Promise<{ modelSize: WhisperModelSize; available: boolean }>
    onSegment: (callback: (segment: TranscriptSegment) => void) => () => void
    onDownloadProgress: (
      callback: (payload: { modelSize: WhisperModelSize; percent: number }) => void
    ) => () => void
  }
  database: {
    listRecordings: (options?: ListOptions) => Promise<Recording[]>
    getRecording: (id: number) => Promise<RecordingWithTranscript | null>
    createRecording: (title: string, duration: number, audioPath: string) => Promise<Recording | null>
    updateRecording: (id: number, data: Partial<Recording>) => Promise<Recording | null>
    deleteRecording: (id: number, hard?: boolean) => Promise<Recording | null>
    search: (query: string, options?: ListOptions) => Promise<Recording[]>
  }
  llm: {
    summarize: (
      transcript: string,
      type: 'incremental' | 'final',
      previousSummary?: string
    ) => Promise<{ success: boolean; output: SummaryOutput | null; cancelled: boolean }>
    stop: () => Promise<{ success: boolean }>
    downloadModel: (modelName: LlmModelName) => Promise<{ success: boolean }>
    checkModel: (modelName?: LlmModelName) => Promise<{ modelName: LlmModelName; available: boolean }>
    unload: () => Promise<{ success: boolean }>
    saveSummary: (recordingId: number, output: SummaryOutput) => Promise<{ id: number }>
    getLatestSummary: (recordingId: number) => Promise<RecordingSummaryRow | null>
    onToken: (callback: (token: string) => void) => () => void
    onComplete: (callback: (output: SummaryOutput) => void) => () => void
    onDownloadProgress: (
      callback: (payload: {
        modelName: LlmModelName
        percent: number
        downloaded: number
        total: number
      }) => void
    ) => () => void
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: VoiceVaultApi
  }
}
