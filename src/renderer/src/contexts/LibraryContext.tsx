import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { RecordingWithTranscript } from '../../../shared/types'
import { LibraryContext, type SortBy, type ViewMode } from './library-context'

export function LibraryProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [recordings, setRecordings] = useState<RecordingWithTranscript[]>([])
  const [selectedRecording, setSelectedRecording] = useState<RecordingWithTranscript | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('createdAt')
  const [viewMode, setViewMode] = useState<ViewMode>('list')

  const refreshRecordings = useCallback(async (): Promise<void> => {
    const rows = await window.api.listRecordings({
      search: searchQuery || undefined,
      sortBy,
      sortOrder: 'DESC',
      includeArchived: false
    })
    const details = await Promise.all(
      rows.map(async (row) => {
        const full = await window.api.getRecording(row.id)
        return (
          full ?? {
            ...row,
            segments: []
          }
        )
      })
    )
    setRecordings(details)
    if (selectedRecording && !details.some((item) => item.id === selectedRecording.id)) {
      setSelectedRecording(null)
    }
  }, [searchQuery, selectedRecording, sortBy])

  useEffect(() => {
    // Async data loading on dependency change — setState is intentional
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshRecordings()
  }, [refreshRecordings])

  const selectRecording = useCallback(async (id: number): Promise<void> => {
    const recording = await window.api.getRecording(id)
    if (recording) {
      setSelectedRecording(recording)
    }
  }, [])

  const deleteRecording = useCallback(
    async (id: number, hard = false): Promise<void> => {
      await window.api.deleteRecording(id, hard)
      await refreshRecordings()
      if (selectedRecording?.id === id) {
        setSelectedRecording(null)
      }
    },
    [refreshRecordings, selectedRecording]
  )

  const value = useMemo(
    () => ({
      recordings,
      selectedRecording,
      searchQuery,
      sortBy,
      viewMode,
      setSearchQuery,
      setSortBy,
      setViewMode,
      selectRecording,
      refreshRecordings,
      deleteRecording
    }),
    [
      deleteRecording,
      recordings,
      refreshRecordings,
      searchQuery,
      selectRecording,
      selectedRecording,
      sortBy,
      viewMode
    ]
  )

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}
