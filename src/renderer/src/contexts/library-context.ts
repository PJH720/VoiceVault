import { createContext } from 'react'
import type { RecordingWithTranscript } from '../../../shared/types'

export type SortBy = 'createdAt' | 'duration' | 'title'
export type ViewMode = 'list' | 'grid'

export type LibraryContextValue = {
  recordings: RecordingWithTranscript[]
  selectedRecording: RecordingWithTranscript | null
  searchQuery: string
  sortBy: SortBy
  viewMode: ViewMode
  setSearchQuery: (query: string) => void
  setSortBy: (sortBy: SortBy) => void
  setViewMode: (mode: ViewMode) => void
  selectRecording: (id: number) => Promise<void>
  refreshRecordings: () => Promise<void>
  deleteRecording: (id: number, hard?: boolean) => Promise<void>
}

export const LibraryContext = createContext<LibraryContextValue | null>(null)
