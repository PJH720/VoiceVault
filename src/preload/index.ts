import { contextBridge, ipcRenderer, webFrame } from 'electron'

// Inlined from @electron-toolkit/preload to avoid electron-vite externalization issue
const electronAPI = {
  ipcRenderer: {
    send(channel: string, ...args: unknown[]): void {
      ipcRenderer.send(channel, ...args)
    },
    sendSync(channel: string, ...args: unknown[]): unknown {
      return ipcRenderer.sendSync(channel, ...args)
    },
    invoke(channel: string, ...args: unknown[]): Promise<unknown> {
      return ipcRenderer.invoke(channel, ...args)
    },
    on(
      channel: string,
      listener: (event: Electron.IpcRendererEvent, ...args: unknown[]) => void
    ): void {
      ipcRenderer.on(channel, listener)
    },
    once(
      channel: string,
      listener: (event: Electron.IpcRendererEvent, ...args: unknown[]) => void
    ): void {
      ipcRenderer.once(channel, listener)
    },
    removeListener(
      channel: string,
      listener: (event: Electron.IpcRendererEvent, ...args: unknown[]) => void
    ): void {
      ipcRenderer.removeListener(channel, listener)
    },
    removeAllListeners(channel: string): void {
      ipcRenderer.removeAllListeners(channel)
    }
  },
  webFrame: {
    insertCSS(css: string): string {
      return webFrame.insertCSS(css)
    },
    setZoomFactor(factor: number): void {
      webFrame.setZoomFactor(factor)
    },
    setZoomLevel(level: number): void {
      webFrame.setZoomLevel(level)
    }
  },
  process: {
    get platform(): NodeJS.Platform {
      return process.platform
    },
    get versions(): NodeJS.ProcessVersions {
      return process.versions
    },
    get env(): NodeJS.ProcessEnv {
      return process.env
    }
  }
}
import {
  AppChannels,
  AudioChannels,
  CloudLlmChannels,
  ClassificationChannels,
  DiarizationChannels,
  ExportChannels,
  RagChannels,
  DatabaseChannels,
  LlmChannels,
  SettingsChannels,
  SystemAudioChannels,
  TranslationChannels,
  WhisperChannels
} from '../shared/ipc-channels'
import type {
  AudioLevelEvent,
  AudioPermissionStatus,
  AudioSourceInfo,
  BatchTranslationItem,
  CaptureConfig,
  ClassificationResult,
  CloudModelName,
  LlmModelName,
  ListOptions,
  ExportOptions,
  ExportResult,
  ExportTemplateSummary,
  Recording,
  RecordingSummaryRow,
  RecordingWithTranscript,
  RecordingResult,
  RecordingTemplate,
  RAGAnswer,
  SearchHistoryEntry,
  SummaryOutput,
  SpeakerProfile,
  SpeakerSegment,
  SupportedLanguage,
  UsageStats,
  SupportedLocale,
  TranscriptSegment,
  TranslationProgress,
  TranslationResult,
  WhisperModelSize
} from '../shared/types'

// Security: restrict to allowlisted path names only (issue #214)
type AppPathName = 'userData' | 'documents' | 'downloads' | 'temp' | 'logs'

const api = {
  startRecording: async (): Promise<{ streamId: string; audioPath: string }> =>
    ipcRenderer.invoke(AudioChannels.START_RECORDING),
  stopRecording: async (): Promise<RecordingResult> =>
    ipcRenderer.invoke(AudioChannels.STOP_RECORDING),
  requestMicPermission: async (): Promise<boolean> =>
    ipcRenderer.invoke(AudioChannels.REQUEST_PERMISSION),
  sendAudioChunk: (pcmData: ArrayBuffer): void => {
    ipcRenderer.send(AudioChannels.SEND_CHUNK, pcmData)
  },
  getCaptureMode: async (): Promise<string> => ipcRenderer.invoke(AudioChannels.CAPTURE_MODE),
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
  ): Promise<Recording | null> =>
    ipcRenderer.invoke(DatabaseChannels.CREATE, title, duration, audioPath),
  updateRecording: async (id: number, data: Partial<Recording>): Promise<Recording | null> =>
    ipcRenderer.invoke(DatabaseChannels.UPDATE, id, data),
  deleteRecording: async (id: number, hard = false): Promise<Recording | null> =>
    ipcRenderer.invoke(DatabaseChannels.DELETE, id, hard),
  searchRecordings: async (query: string, options?: ListOptions): Promise<Recording[]> =>
    ipcRenderer.invoke(DatabaseChannels.SEARCH, query, options),
  getAppPath: async (name: AppPathName): Promise<string> =>
    ipcRenderer.invoke(AppChannels.GET_PATH, name),
  getVersion: async (): Promise<string> => ipcRenderer.invoke(AppChannels.GET_VERSION),
  reportError: async (report: { message: string; stack?: string; page?: string }): Promise<void> =>
    ipcRenderer.invoke(AppChannels.REPORT_ERROR, report),
  getLocale: async (): Promise<SupportedLocale> => ipcRenderer.invoke(SettingsChannels.GET_LOCALE),
  setLocale: async (locale: SupportedLocale): Promise<SupportedLocale> =>
    ipcRenderer.invoke(SettingsChannels.SET_LOCALE, locale),
  getWhisperModel: async (): Promise<WhisperModelSize> =>
    ipcRenderer.invoke(SettingsChannels.GET_WHISPER_MODEL),
  setWhisperModel: async (model: WhisperModelSize): Promise<WhisperModelSize> =>
    ipcRenderer.invoke(SettingsChannels.SET_WHISPER_MODEL, model),
  getLlmModel: async (): Promise<LlmModelName> =>
    ipcRenderer.invoke(SettingsChannels.GET_LLM_MODEL),
  setLlmModel: async (model: LlmModelName): Promise<LlmModelName> =>
    ipcRenderer.invoke(SettingsChannels.SET_LLM_MODEL, model),
  transcription: {
    start: async (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(WhisperChannels.START_STREAM),
    stop: async (): Promise<{ success: boolean; segmentCount: number }> =>
      ipcRenderer.invoke(WhisperChannels.STOP),
    saveSegments: async (
      recordingId: number,
      segments: TranscriptSegment[]
    ): Promise<{ inserted: number }> =>
      ipcRenderer.invoke(WhisperChannels.SAVE_SEGMENTS, recordingId, segments),
    listSegments: async (recordingId: number): Promise<TranscriptSegment[]> =>
      ipcRenderer.invoke(WhisperChannels.LIST_SEGMENTS, recordingId),
    downloadModel: async (modelSize: WhisperModelSize): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(WhisperChannels.DOWNLOAD_MODEL, modelSize),
    checkModel: async (
      modelSize: WhisperModelSize
    ): Promise<{ modelSize: WhisperModelSize; available: boolean }> =>
      ipcRenderer.invoke(WhisperChannels.MODEL_STATUS, modelSize),
    checkBinary: async (): Promise<{ available: boolean; binaryPath: string | null }> =>
      ipcRenderer.invoke(WhisperChannels.BINARY_STATUS),
    transcribeFile: async (
      wavFilePath: string,
      language?: string
    ): Promise<{ success: boolean; segments: import('../shared/types').TranscriptSegment[] }> =>
      ipcRenderer.invoke(WhisperChannels.TRANSCRIBE_FILE, wavFilePath, language),
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
    createRecording: (
      title: string,
      duration: number,
      audioPath: string
    ): Promise<Recording | null> =>
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
    checkModel: (
      modelName?: LlmModelName
    ): Promise<{ modelName: LlmModelName; available: boolean }> =>
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
      callback: (payload: {
        modelName: LlmModelName
        percent: number
        downloaded: number
        total: number
      }) => void
    ): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { modelName: LlmModelName; percent: number; downloaded: number; total: number }
      ): void => callback(payload)
      ipcRenderer.on(LlmChannels.ON_DOWNLOAD_PROGRESS, listener)
      return () => ipcRenderer.removeListener(LlmChannels.ON_DOWNLOAD_PROGRESS, listener)
    }
  },
  cloudLLM: {
    setApiKey: (key: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(CloudLlmChannels.SET_API_KEY, key),
    getApiKey: (): Promise<{ key: string | null }> =>
      ipcRenderer.invoke(CloudLlmChannels.GET_API_KEY),
    setOpenAIApiKey: (key: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(CloudLlmChannels.SET_OPENAI_API_KEY, key),
    getOpenAIApiKey: (): Promise<{ key: string | null }> =>
      ipcRenderer.invoke(CloudLlmChannels.GET_OPENAI_API_KEY),
    setGeminiApiKey: (key: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(CloudLlmChannels.SET_GEMINI_API_KEY, key),
    getGeminiApiKey: (): Promise<{ key: string | null }> =>
      ipcRenderer.invoke(CloudLlmChannels.GET_GEMINI_API_KEY),
    summarize: (
      transcript: string,
      model?: CloudModelName
    ): Promise<{ success: boolean; output: SummaryOutput }> =>
      ipcRenderer.invoke(CloudLlmChannels.SUMMARIZE, transcript, model),
    estimateCost: (
      text: string,
      model: CloudModelName
    ): Promise<{ inputTokens: number; outputTokens: number; cost: number }> =>
      ipcRenderer.invoke(CloudLlmChannels.ESTIMATE_COST, text, model),
    getUsageStats: (): Promise<UsageStats> => ipcRenderer.invoke(CloudLlmChannels.USAGE_STATS),
    resetStats: (): Promise<UsageStats> => ipcRenderer.invoke(CloudLlmChannels.RESET_STATS),
    setLocalOnly: (enabled: boolean): Promise<{ enabled: boolean }> =>
      ipcRenderer.invoke(CloudLlmChannels.SET_LOCAL_ONLY, enabled),
    getLocalOnly: (): Promise<{ enabled: boolean }> =>
      ipcRenderer.invoke(CloudLlmChannels.GET_LOCAL_ONLY),
    setProvider: (provider: 'local' | 'cloud'): Promise<{ provider: 'local' | 'cloud' }> =>
      ipcRenderer.invoke(CloudLlmChannels.SET_PROVIDER, provider),
    getProvider: (): Promise<{ provider: 'local' | 'cloud' }> =>
      ipcRenderer.invoke(CloudLlmChannels.GET_PROVIDER),
    setModel: (model: CloudModelName): Promise<{ model: CloudModelName }> =>
      ipcRenderer.invoke(CloudLlmChannels.SET_MODEL, model),
    getModel: (): Promise<{ model: CloudModelName }> =>
      ipcRenderer.invoke(CloudLlmChannels.GET_MODEL),
    onToken: (callback: (token: string) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, token: string): void => callback(token)
      ipcRenderer.on(CloudLlmChannels.ON_TOKEN, listener)
      return () => ipcRenderer.removeListener(CloudLlmChannels.ON_TOKEN, listener)
    },
    onComplete: (callback: (output: SummaryOutput) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, output: SummaryOutput): void =>
        callback(output)
      ipcRenderer.on(CloudLlmChannels.ON_COMPLETE, listener)
      return () => ipcRenderer.removeListener(CloudLlmChannels.ON_COMPLETE, listener)
    }
  },
  diarization: {
    process: (
      audioPath: string,
      recordingId: number
    ): Promise<{ success: boolean; segments: SpeakerSegment[] }> =>
      ipcRenderer.invoke(DiarizationChannels.PROCESS, audioPath, recordingId),
    alignTranscript: (
      recordingId: number,
      transcriptSegments: TranscriptSegment[],
      speakerSegments?: SpeakerSegment[]
    ): Promise<Array<TranscriptSegment & { speaker: string }>> =>
      ipcRenderer.invoke(
        DiarizationChannels.ALIGN_TRANSCRIPT,
        recordingId,
        transcriptSegments,
        speakerSegments
      ),
    listSpeakerSegments: (recordingId: number): Promise<SpeakerSegment[]> =>
      ipcRenderer.invoke(DiarizationChannels.LIST_SPEAKER_SEGMENTS, recordingId),
    onSegment: (callback: (segment: SpeakerSegment) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, segment: SpeakerSegment): void =>
        callback(segment)
      ipcRenderer.on(DiarizationChannels.ON_SEGMENT, listener)
      return () => ipcRenderer.removeListener(DiarizationChannels.ON_SEGMENT, listener)
    },
    listSpeakers: (): Promise<SpeakerProfile[]> =>
      ipcRenderer.invoke(DiarizationChannels.LIST_SPEAKERS),
    createSpeaker: (name: string): Promise<SpeakerProfile> =>
      ipcRenderer.invoke(DiarizationChannels.CREATE_SPEAKER, name),
    updateSpeaker: (
      id: number,
      updates: { name?: string; color?: string }
    ): Promise<SpeakerProfile | null> =>
      ipcRenderer.invoke(DiarizationChannels.UPDATE_SPEAKER, id, updates),
    mergeSpeakers: (sourceId: number, targetId: number): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(DiarizationChannels.MERGE_SPEAKERS, sourceId, targetId)
  },
  rag: {
    query: (question: string, topK?: number): Promise<RAGAnswer> =>
      ipcRenderer.invoke(RagChannels.QUERY, question, topK),
    embedRecordings: (): Promise<{ success: boolean; embedded: number }> =>
      ipcRenderer.invoke(RagChannels.EMBED_RECORDINGS),
    searchHistory: (): Promise<SearchHistoryEntry[]> =>
      ipcRenderer.invoke(RagChannels.SEARCH_HISTORY),
    embeddingModelStatus: (): Promise<{ available: boolean }> =>
      ipcRenderer.invoke(RagChannels.EMBEDDING_MODEL_STATUS),
    indexStatus: (): Promise<{ vectorCount: number }> =>
      ipcRenderer.invoke(RagChannels.INDEX_STATUS),
    onProgress: (callback: (payload: { current: number; total: number }) => void): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { current: number; total: number }
      ): void => callback(payload)
      ipcRenderer.on(RagChannels.ON_PROGRESS, listener)
      return () => ipcRenderer.removeListener(RagChannels.ON_PROGRESS, listener)
    }
  },
  export: {
    obsidian: (recordingId: number, options: ExportOptions): Promise<ExportResult> =>
      ipcRenderer.invoke(ExportChannels.OBSIDIAN, recordingId, options),
    batch: (recordingIds: number[], options: ExportOptions): Promise<{ paths: string[] }> =>
      ipcRenderer.invoke(ExportChannels.BATCH, recordingIds, options),
    preview: (recordingId: number, templateName: string): Promise<{ content: string }> =>
      ipcRenderer.invoke(ExportChannels.PREVIEW, recordingId, templateName),
    setVaultPath: (): Promise<{ path: string | null }> =>
      ipcRenderer.invoke(ExportChannels.SET_VAULT_PATH),
    getVaultPath: (): Promise<{ path: string | null }> =>
      ipcRenderer.invoke(ExportChannels.GET_VAULT_PATH),
    getTemplates: (): Promise<{ templates: ExportTemplateSummary[] }> =>
      ipcRenderer.invoke(ExportChannels.GET_TEMPLATES)
  },
  classification: {
    autoClassify: (transcript: string): Promise<ClassificationResult> =>
      ipcRenderer.invoke(ClassificationChannels.AUTO_CLASSIFY, transcript),
    applyTemplate: (
      recordingId: number,
      templateId: string
    ): Promise<{ success: boolean; output: SummaryOutput }> =>
      ipcRenderer.invoke(ClassificationChannels.APPLY_TEMPLATE, recordingId, templateId)
  },
  templates: {
    list: (): Promise<RecordingTemplate[]> =>
      ipcRenderer.invoke(ClassificationChannels.TEMPLATES_LIST),
    get: (id: string): Promise<RecordingTemplate | null> =>
      ipcRenderer.invoke(ClassificationChannels.TEMPLATES_GET, id),
    create: (
      input: Omit<RecordingTemplate, 'id' | 'category' | 'createdAt' | 'updatedAt'>
    ): Promise<RecordingTemplate> =>
      ipcRenderer.invoke(ClassificationChannels.TEMPLATES_CREATE, input),
    update: (id: string, updates: Partial<RecordingTemplate>): Promise<RecordingTemplate> =>
      ipcRenderer.invoke(ClassificationChannels.TEMPLATES_UPDATE, id, updates),
    delete: (id: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(ClassificationChannels.TEMPLATES_DELETE, id),
    export: (id: string): Promise<{ json: string }> =>
      ipcRenderer.invoke(ClassificationChannels.TEMPLATES_EXPORT, id)
  },
  systemAudio: {
    listSources: (): Promise<{ sources: AudioSourceInfo[] }> =>
      ipcRenderer.invoke(SystemAudioChannels.LIST_SOURCES),
    startCapture: (config: CaptureConfig): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(SystemAudioChannels.START_CAPTURE, config),
    stopCapture: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(SystemAudioChannels.STOP_CAPTURE),
    checkPermissions: (): Promise<AudioPermissionStatus> =>
      ipcRenderer.invoke(SystemAudioChannels.CHECK_PERMISSIONS),
    requestPermissions: (
      type: 'screen' | 'microphone'
    ): Promise<{ success: boolean; permissions: AudioPermissionStatus }> =>
      ipcRenderer.invoke(SystemAudioChannels.REQUEST_PERMISSIONS, type)
  },
  translation: {
    translate: (
      text: string,
      sourceLanguage: string,
      targetLanguage: string,
      segmentId?: number
    ): Promise<TranslationResult> =>
      ipcRenderer.invoke(
        TranslationChannels.TRANSLATE,
        text,
        sourceLanguage,
        targetLanguage,
        segmentId
      ),
    batchTranslate: (
      items: BatchTranslationItem[],
      sourceLanguage: string,
      targetLanguage: string
    ): Promise<Array<{ id: number; result: TranslationResult }>> =>
      ipcRenderer.invoke(
        TranslationChannels.BATCH_TRANSLATE,
        items,
        sourceLanguage,
        targetLanguage
      ),
    getLanguages: (): Promise<{ languages: SupportedLanguage[] }> =>
      ipcRenderer.invoke(TranslationChannels.GET_LANGUAGES),
    setTargetLanguage: (language: string): Promise<{ language: string }> =>
      ipcRenderer.invoke(TranslationChannels.SET_TARGET_LANGUAGE, language),
    getTargetLanguage: (): Promise<{ language: string }> =>
      ipcRenderer.invoke(TranslationChannels.GET_TARGET_LANGUAGE),
    onProgress: (callback: (payload: TranslationProgress) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: TranslationProgress): void =>
        callback(payload)
      ipcRenderer.on(TranslationChannels.ON_PROGRESS, listener)
      return () => ipcRenderer.removeListener(TranslationChannels.ON_PROGRESS, listener)
    },
    onTranslated: (
      callback: (payload: { id: number; result: TranslationResult }) => void
    ): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { id: number; result: TranslationResult }
      ): void => callback(payload)
      ipcRenderer.on(TranslationChannels.ON_TRANSLATED, listener)
      return () => ipcRenderer.removeListener(TranslationChannels.ON_TRANSLATED, listener)
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
  // Window augmentation is in index.d.ts but not resolved by tsconfig.node.json
  // @ts-expect-error — types defined in preload/index.d.ts for renderer consumption
  window.electron = electronAPI
  // @ts-expect-error — types defined in preload/index.d.ts for renderer consumption
  window.api = api
}
