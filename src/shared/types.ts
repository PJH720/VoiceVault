export interface Recording {
  id: number
  title: string
  createdAt: string
  updatedAt: string
  duration: number
  audioPath: string
  category?: string
  tags: string[]
  isBookmarked: boolean
  isArchived: boolean
  fileSizeBytes: number
  templateId?: string
  classificationConfidence?: number
}

export interface RecordingWithTranscript extends Recording {
  segments: TranscriptSegment[]
  summary?: SummaryOutput
}

export interface AudioLevelEvent {
  streamId: string
  rms: number
  peak: number
  timestamp: number
}

export interface AudioSourceInfo {
  id: string
  name: string
  type: 'input' | 'output' | 'app'
  isDefault: boolean
  appName?: string
}

export interface CaptureConfig {
  micSource?: string
  systemSource?: string
  mixMode: 'mic-only' | 'system-only' | 'both'
  micVolume: number
  systemVolume: number
}

export interface AudioPermissionStatus {
  screenRecording: boolean
  microphone: boolean
}

export interface SupportedLanguage {
  code: string
  name: string
}

export interface TranslationResult {
  originalText: string
  translatedText: string
  sourceLanguage: string
  targetLanguage: string
  confidence: number
  model: string
}

export interface BatchTranslationItem {
  id: number
  text: string
}

export interface TranslationProgress {
  current: number
  total: number
}

export interface RecordingResult {
  id: number
  audioPath: string
  duration: number
  fileSizeBytes: number
}

export type WhisperModelSize = 'base' | 'small' | 'medium' | 'large-v3-turbo'
export type LlmModelName = 'gemma-2-3n-instruct-q4_k_m' | 'llama-3.2-3b-instruct-q4_k_m'
export type CloudModelName =
  | 'claude-sonnet-4-5-20250514'
  | 'claude-opus-4-6-20250612'
  | 'claude-haiku-3-5-20241022'
  // Legacy identifiers (still accepted by API)
  | 'claude-3-5-sonnet-20241022'
  | 'claude-3-opus-20240229'
  | 'claude-3-haiku-20240307'

export interface TranscriptWord {
  word: string
  start: number
  end: number
}

export interface TranscriptSegment {
  id?: number
  recordingId?: number
  text: string
  start: number
  end: number
  language: string
  confidence: number
  words?: TranscriptWord[]
  speaker?: string
  speakerProfileId?: number | null
  speakerName?: string
  speakerColor?: string
}

export interface SpeakerSegment {
  id?: number
  recordingId: number
  start: number
  end: number
  speaker: string
  confidence: number
  speakerProfileId?: number | null
}

export interface SpeakerStats {
  speaker: string
  totalDuration: number
  percentage: number
  turnCount: number
}

export interface SpeakerProfile {
  id: number
  name: string
  color: string
  recordingCount: number
  totalDuration: number
  createdAt: string
}

export interface VectorDocumentMetadata {
  recordingTitle: string
  timestamp?: number
  speaker?: string
}

export interface VectorDocument {
  id: number
  recordingId: number
  segmentId?: number
  text: string
  embedding: Float32Array
  metadata: VectorDocumentMetadata
}

export interface SearchResult {
  document: VectorDocument
  similarity: number
}

export interface RAGSource {
  recordingId: number
  recordingTitle: string
  timestamp?: number
  speaker?: string
  text: string
  relevance: number
}

export interface RAGAnswer {
  answer: string
  sources: RAGSource[]
}

export interface SearchHistoryEntry {
  id: number
  query: string
  resultCount: number
  createdAt: string
}

export type ExportFolderStructure = 'flat' | 'by-date' | 'by-category'

export interface ExportTemplateSummary {
  name: string
  label: string
}

export interface ExportOptions {
  templateName: string
  vaultPath: string
  folderStructure: ExportFolderStructure
  includeAudio: boolean
  audioAsAttachment: boolean
  generateWikilinks: boolean
}

export interface ExportResult {
  path: string
  content: string
}

export interface RecordingTemplate {
  id: string
  name: string
  description: string
  icon: string
  color: string
  category: 'built-in' | 'custom'
  keywords: string[]
  prompts: {
    summary: string
    actionItems?: string
    keyPoints?: string
    customFields?: Array<{ name: string; prompt: string }>
  }
  exportTemplate?: string
  createdAt: string
  updatedAt: string
  author?: string
}

export interface ClassificationResult {
  templateId: string
  confidence: number
  reasoning?: string
}

export interface SummaryActionItem {
  task: string
  assignee?: string
  deadline?: string
  priority?: 'low' | 'medium' | 'high'
}

export interface SummaryKeyStatement {
  speaker?: string
  text: string
  timestamp: number
}

export interface SummaryOutput {
  summary: string
  actionItems: SummaryActionItem[]
  discussionPoints: string[]
  keyStatements: SummaryKeyStatement[]
  decisions: string[]
  metadata?: {
    provider: 'local' | 'anthropic'
    model?: string
    inputTokens?: number
    outputTokens?: number
    cost?: number
  }
}

export interface RecordingSummaryRow {
  id: number
  recordingId: number
  createdAt: string
  output: SummaryOutput
}

export interface UsageStats {
  totalCost: number
  totalRequests: number
  lastReset: string
}

export interface ListOptions {
  search?: string
  category?: string
  sortBy?: 'createdAt' | 'duration' | 'title'
  sortOrder?: 'ASC' | 'DESC'
  limit?: number
  offset?: number
  includeArchived?: boolean
}

export type SupportedLocale = 'ko' | 'en' | 'ja'

export interface LocaleMetadata {
  code: SupportedLocale
  name: string
  nativeName: string
  direction: 'ltr' | 'rtl'
  complete: boolean
}
