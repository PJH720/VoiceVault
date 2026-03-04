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

export interface RecordingResult {
  id: number
  audioPath: string
  duration: number
  fileSizeBytes: number
}

export type WhisperModelSize = 'base' | 'small' | 'medium' | 'large-v3-turbo'
export type LlmModelName = 'gemma-2-3n-instruct-q4_k_m' | 'llama-3.2-3b-instruct-q4_k_m'

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
}

export interface RecordingSummaryRow {
  id: number
  recordingId: number
  createdAt: string
  output: SummaryOutput
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
