export interface Recording {
  id: number
  title: string
  createdAt: string
  duration: number
  audioPath: string
  category?: string
  isBookmarked: boolean
  fileSizeBytes: number
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

export interface ListOptions {
  search?: string
  sort?: string
  limit?: number
  offset?: number
}

export type SupportedLocale = 'ko' | 'en' | 'ja'
