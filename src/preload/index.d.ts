import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  AudioLevelEvent,
  AudioPermissionStatus,
  AudioSourceInfo,
  BatchTranslationItem,
  CaptureConfig,
  ClassificationResult,
  CloudModelName,
  ExportOptions,
  ExportResult,
  ExportTemplateSummary,
  LlmModelName,
  ListOptions,
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
  sendAudioChunk: (pcmData: ArrayBuffer) => void
  getCaptureMode: () => Promise<string>
  onAudioLevel: (callback: (event: AudioLevelEvent) => void) => () => void
  listRecordings: (options?: ListOptions) => Promise<Recording[]>
  getRecording: (id: number) => Promise<RecordingWithTranscript | null>
  createRecording: (title: string, duration: number, audioPath: string) => Promise<Recording | null>
  updateRecording: (id: number, data: Partial<Recording>) => Promise<Recording | null>
  deleteRecording: (id: number, hard?: boolean) => Promise<Recording | null>
  searchRecordings: (query: string, options?: ListOptions) => Promise<Recording[]>
  getAppPath: (name: AppPathName) => Promise<string>
  getVersion: () => Promise<string>
  reportError: (report: { message: string; stack?: string; page?: string }) => Promise<void>
  getLocale: () => Promise<SupportedLocale>
  setLocale: (locale: SupportedLocale) => Promise<SupportedLocale>
  getWhisperModel: () => Promise<WhisperModelSize>
  setWhisperModel: (model: WhisperModelSize) => Promise<WhisperModelSize>
  getLlmModel: () => Promise<LlmModelName>
  setLlmModel: (model: LlmModelName) => Promise<LlmModelName>
  transcription: {
    start: () => Promise<{ success: boolean }>
    stop: () => Promise<{ success: boolean; segmentCount: number }>
    saveSegments: (
      recordingId: number,
      segments: TranscriptSegment[]
    ) => Promise<{ inserted: number }>
    listSegments: (recordingId: number) => Promise<TranscriptSegment[]>
    downloadModel: (modelSize: WhisperModelSize) => Promise<{ success: boolean }>
    checkModel: (
      modelSize: WhisperModelSize
    ) => Promise<{ modelSize: WhisperModelSize; available: boolean }>
    checkBinary: () => Promise<{ available: boolean; binaryPath: string | null }>
    transcribeFile: (
      wavFilePath: string,
      language?: string
    ) => Promise<{ success: boolean; segments: TranscriptSegment[] }>
    onSegment: (callback: (segment: TranscriptSegment) => void) => () => void
    onDownloadProgress: (
      callback: (payload: { modelSize: WhisperModelSize; percent: number }) => void
    ) => () => void
  }
  database: {
    listRecordings: (options?: ListOptions) => Promise<Recording[]>
    getRecording: (id: number) => Promise<RecordingWithTranscript | null>
    createRecording: (
      title: string,
      duration: number,
      audioPath: string
    ) => Promise<Recording | null>
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
    checkModel: (
      modelName?: LlmModelName
    ) => Promise<{ modelName: LlmModelName; available: boolean }>
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
  cloudLLM: {
    setApiKey: (key: string) => Promise<{ success: boolean }>
    getApiKey: () => Promise<{ key: string | null }>
    setOpenAIApiKey: (key: string) => Promise<{ success: boolean }>
    getOpenAIApiKey: () => Promise<{ key: string | null }>
    setGeminiApiKey: (key: string) => Promise<{ success: boolean }>
    getGeminiApiKey: () => Promise<{ key: string | null }>
    summarize: (
      transcript: string,
      model?: CloudModelName
    ) => Promise<{ success: boolean; output: SummaryOutput }>
    estimateCost: (
      text: string,
      model: CloudModelName
    ) => Promise<{ inputTokens: number; outputTokens: number; cost: number }>
    getUsageStats: () => Promise<UsageStats>
    resetStats: () => Promise<UsageStats>
    setLocalOnly: (enabled: boolean) => Promise<{ enabled: boolean }>
    getLocalOnly: () => Promise<{ enabled: boolean }>
    setProvider: (provider: 'local' | 'cloud') => Promise<{ provider: 'local' | 'cloud' }>
    getProvider: () => Promise<{ provider: 'local' | 'cloud' }>
    setModel: (model: CloudModelName) => Promise<{ model: CloudModelName }>
    getModel: () => Promise<{ model: CloudModelName }>
    onToken: (callback: (token: string) => void) => () => void
    onComplete: (callback: (output: SummaryOutput) => void) => () => void
  }
  diarization: {
    process: (
      audioPath: string,
      recordingId: number
    ) => Promise<{ success: boolean; segments: SpeakerSegment[] }>
    alignTranscript: (
      recordingId: number,
      transcriptSegments: TranscriptSegment[],
      speakerSegments?: SpeakerSegment[]
    ) => Promise<Array<TranscriptSegment & { speaker: string }>>
    listSpeakerSegments: (recordingId: number) => Promise<SpeakerSegment[]>
    onSegment: (callback: (segment: SpeakerSegment) => void) => () => void
    listSpeakers: () => Promise<SpeakerProfile[]>
    createSpeaker: (name: string) => Promise<SpeakerProfile>
    updateSpeaker: (
      id: number,
      updates: { name?: string; color?: string }
    ) => Promise<SpeakerProfile | null>
    mergeSpeakers: (sourceId: number, targetId: number) => Promise<{ success: boolean }>
  }
  rag: {
    query: (question: string, topK?: number) => Promise<RAGAnswer>
    embedRecordings: () => Promise<{ success: boolean; embedded: number }>
    searchHistory: () => Promise<SearchHistoryEntry[]>
    onProgress: (callback: (payload: { current: number; total: number }) => void) => () => void
  }
  export: {
    obsidian: (recordingId: number, options: ExportOptions) => Promise<ExportResult>
    batch: (recordingIds: number[], options: ExportOptions) => Promise<{ paths: string[] }>
    preview: (recordingId: number, templateName: string) => Promise<{ content: string }>
    setVaultPath: () => Promise<{ path: string | null }>
    getVaultPath: () => Promise<{ path: string | null }>
    getTemplates: () => Promise<{ templates: ExportTemplateSummary[] }>
  }
  classification: {
    autoClassify: (transcript: string) => Promise<ClassificationResult>
    applyTemplate: (
      recordingId: number,
      templateId: string
    ) => Promise<{ success: boolean; output: SummaryOutput }>
  }
  templates: {
    list: () => Promise<RecordingTemplate[]>
    get: (id: string) => Promise<RecordingTemplate | null>
    create: (
      input: Omit<RecordingTemplate, 'id' | 'category' | 'createdAt' | 'updatedAt'>
    ) => Promise<RecordingTemplate>
    update: (id: string, updates: Partial<RecordingTemplate>) => Promise<RecordingTemplate>
    delete: (id: string) => Promise<{ success: boolean }>
    export: (id: string) => Promise<{ json: string }>
  }
  systemAudio: {
    listSources: () => Promise<{ sources: AudioSourceInfo[] }>
    startCapture: (config: CaptureConfig) => Promise<{ success: boolean }>
    stopCapture: () => Promise<{ success: boolean }>
    checkPermissions: () => Promise<AudioPermissionStatus>
    requestPermissions: (
      type: 'screen' | 'microphone'
    ) => Promise<{ success: boolean; permissions: AudioPermissionStatus }>
  }
  translation: {
    translate: (
      text: string,
      sourceLanguage: string,
      targetLanguage: string,
      segmentId?: number
    ) => Promise<TranslationResult>
    batchTranslate: (
      items: BatchTranslationItem[],
      sourceLanguage: string,
      targetLanguage: string
    ) => Promise<Array<{ id: number; result: TranslationResult }>>
    getLanguages: () => Promise<{ languages: SupportedLanguage[] }>
    setTargetLanguage: (language: string) => Promise<{ language: string }>
    getTargetLanguage: () => Promise<{ language: string }>
    onProgress: (callback: (payload: TranslationProgress) => void) => () => void
    onTranslated: (
      callback: (payload: { id: number; result: TranslationResult }) => void
    ) => () => void
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: VoiceVaultApi
  }
}
