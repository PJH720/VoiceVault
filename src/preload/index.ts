import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import {
  AppChannels,
  AudioChannels,
  DatabaseChannels,
  LlmChannels,
  SettingsChannels,
  WhisperChannels
} from '../shared/ipc-channels'
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

const api = {
  startRecording: async (): Promise<{ streamId: string; audioPath: string }> =>
    ipcRenderer.invoke(AudioChannels.START_RECORDING),
  stopRecording: async (): Promise<RecordingResult> =>
    ipcRenderer.invoke(AudioChannels.STOP_RECORDING),
  requestMicPermission: async (): Promise<boolean> =>
    ipcRenderer.invoke(AudioChannels.REQUEST_PERMISSION),
  onAudioLevel: (callback: (event: AudioLevelEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AudioLevelEvent): void => {
      callback(payload)
    }
    ipcRenderer.on(AudioChannels.AUDIO_LEVEL, listener)
    return () => ipcRenderer.removeListener(AudioChannels.AUDIO_LEVEL, listener)
  },
  listRecordings: async (options?: ListOptions): Promise<Recording[]> =>
    ipcRenderer.invoke(DatabaseChannels.LIST, options),
  getRecording: async (id: number): Promise<RecordingWithTranscript | null> =>
    ipcRenderer.invoke(DatabaseChannels.GET, id),
  createRecording: async (
    title: string,
    duration: number,
    audioPath: string
  ): Promise<Recording | null> => ipcRenderer.invoke(DatabaseChannels.CREATE, title, duration, audioPath),
  updateRecording: async (id: number, data: Partial<Recording>): Promise<Recording | null> =>
    ipcRenderer.invoke(DatabaseChannels.UPDATE, id, data),
  deleteRecording: async (id: number, hard = false): Promise<Recording | null> =>
    ipcRenderer.invoke(DatabaseChannels.DELETE, id, hard),
  searchRecordings: async (query: string, options?: ListOptions): Promise<Recording[]> =>
    ipcRenderer.invoke(DatabaseChannels.SEARCH, query, options),
  getAppPath: async (name: AppPathName): Promise<string> =>
    ipcRenderer.invoke(AppChannels.GET_PATH, name),
  getVersion: async (): Promise<string> => ipcRenderer.invoke(AppChannels.GET_VERSION),
  getLocale: async (): Promise<SupportedLocale> => ipcRenderer.invoke(SettingsChannels.GET_LOCALE),
  setLocale: async (locale: SupportedLocale): Promise<SupportedLocale> =>
    ipcRenderer.invoke(SettingsChannels.SET_LOCALE, locale),
  getWhisperModel: async (): Promise<WhisperModelSize> =>
    ipcRenderer.invoke(SettingsChannels.GET_WHISPER_MODEL),
  setWhisperModel: async (model: WhisperModelSize): Promise<WhisperModelSize> =>
    ipcRenderer.invoke(SettingsChannels.SET_WHISPER_MODEL, model),
  getLlmModel: async (): Promise<LlmModelName> => ipcRenderer.invoke(SettingsChannels.GET_LLM_MODEL),
  setLlmModel: async (model: LlmModelName): Promise<LlmModelName> =>
    ipcRenderer.invoke(SettingsChannels.SET_LLM_MODEL, model),
  transcription: {
    start: async (): Promise<{ success: boolean }> => ipcRenderer.invoke(WhisperChannels.START_STREAM),
    stop: async (): Promise<{ success: boolean; segmentCount: number }> =>
      ipcRenderer.invoke(WhisperChannels.STOP),
    saveSegments: async (recordingId: number, segments: TranscriptSegment[]): Promise<{ inserted: number }> =>
      ipcRenderer.invoke(WhisperChannels.SAVE_SEGMENTS, recordingId, segments),
    listSegments: async (recordingId: number): Promise<TranscriptSegment[]> =>
      ipcRenderer.invoke(WhisperChannels.LIST_SEGMENTS, recordingId),
    downloadModel: async (modelSize: WhisperModelSize): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(WhisperChannels.DOWNLOAD_MODEL, modelSize),
    checkModel: async (modelSize: WhisperModelSize): Promise<{ modelSize: WhisperModelSize; available: boolean }> =>
      ipcRenderer.invoke(WhisperChannels.MODEL_STATUS, modelSize),
    onSegment: (callback: (segment: TranscriptSegment) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, segment: TranscriptSegment): void => {
        callback(segment)
      }
      ipcRenderer.on(WhisperChannels.ON_SEGMENT, listener)
      return () => ipcRenderer.removeListener(WhisperChannels.ON_SEGMENT, listener)
    },
    onDownloadProgress: (
      callback: (payload: { modelSize: WhisperModelSize; percent: number }) => void
    ): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { modelSize: WhisperModelSize; percent: number }
      ): void => {
        callback(payload)
      }
      ipcRenderer.on(WhisperChannels.ON_DOWNLOAD_PROGRESS, listener)
      return () => ipcRenderer.removeListener(WhisperChannels.ON_DOWNLOAD_PROGRESS, listener)
    }
  },
  database: {
    listRecordings: (options?: ListOptions): Promise<Recording[]> =>
      ipcRenderer.invoke(DatabaseChannels.LIST, options),
    getRecording: (id: number): Promise<RecordingWithTranscript | null> =>
      ipcRenderer.invoke(DatabaseChannels.GET, id),
    createRecording: (title: string, duration: number, audioPath: string): Promise<Recording | null> =>
      ipcRenderer.invoke(DatabaseChannels.CREATE, title, duration, audioPath),
    updateRecording: (id: number, data: Partial<Recording>): Promise<Recording | null> =>
      ipcRenderer.invoke(DatabaseChannels.UPDATE, id, data),
    deleteRecording: (id: number, hard = false): Promise<Recording | null> =>
      ipcRenderer.invoke(DatabaseChannels.DELETE, id, hard),
    search: (query: string, options?: ListOptions): Promise<Recording[]> =>
      ipcRenderer.invoke(DatabaseChannels.SEARCH, query, options)
  },
  llm: {
    summarize: (
      transcript: string,
      type: 'incremental' | 'final',
      previousSummary = ''
    ): Promise<{ success: boolean; output: SummaryOutput | null; cancelled: boolean }> =>
      ipcRenderer.invoke(LlmChannels.SUMMARIZE_STREAM, transcript, type, previousSummary),
    stop: (): Promise<{ success: boolean }> => ipcRenderer.invoke(LlmChannels.STOP),
    downloadModel: (modelName: LlmModelName): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(LlmChannels.DOWNLOAD_MODEL, modelName),
    checkModel: (modelName?: LlmModelName): Promise<{ modelName: LlmModelName; available: boolean }> =>
      ipcRenderer.invoke(LlmChannels.MODEL_STATUS, modelName),
    unload: (): Promise<{ success: boolean }> => ipcRenderer.invoke(LlmChannels.UNLOAD),
    saveSummary: (recordingId: number, output: SummaryOutput): Promise<{ id: number }> =>
      ipcRenderer.invoke(LlmChannels.SAVE_SUMMARY, recordingId, output),
    getLatestSummary: (recordingId: number): Promise<RecordingSummaryRow | null> =>
      ipcRenderer.invoke(LlmChannels.GET_LATEST_SUMMARY, recordingId),
    onToken: (callback: (token: string) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, token: string): void => callback(token)
      ipcRenderer.on(LlmChannels.ON_TOKEN, listener)
      return () => ipcRenderer.removeListener(LlmChannels.ON_TOKEN, listener)
    },
    onComplete: (callback: (output: SummaryOutput) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, output: SummaryOutput): void =>
        callback(output)
      ipcRenderer.on(LlmChannels.ON_COMPLETE, listener)
      return () => ipcRenderer.removeListener(LlmChannels.ON_COMPLETE, listener)
    },
    onDownloadProgress: (
      callback: (payload: { modelName: LlmModelName; percent: number; downloaded: number; total: number }) => void
    ): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { modelName: LlmModelName; percent: number; downloaded: number; total: number }
      ): void => callback(payload)
      ipcRenderer.on(LlmChannels.ON_DOWNLOAD_PROGRESS, listener)
      return () => ipcRenderer.removeListener(LlmChannels.ON_DOWNLOAD_PROGRESS, listener)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
