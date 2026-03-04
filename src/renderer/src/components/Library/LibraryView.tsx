import { useMemo } from 'react'
import { RecordingDetail } from './RecordingDetail'
import { RecordingCard } from './RecordingCard'
import { useLibraryContext } from '../../hooks/useLibraryContext'

export function LibraryView(): React.JSX.Element {
  const {
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
  } = useLibraryContext()

  const emptyMessage = useMemo(
    () => (searchQuery ? 'No recordings matched your search.' : 'No recordings yet. Start recording.'),
    [searchQuery]
  )

  return (
    <div className="library-layout">
      <div className="panel">
        <div className="search-row library-toolbar">
          <input
            placeholder="Search title/transcript..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}>
            <option value="createdAt">Newest</option>
            <option value="duration">Duration</option>
            <option value="title">Title</option>
          </select>
          <div className="view-toggle">
            <button
              className={viewMode === 'list' ? 'active' : ''}
              onClick={() => setViewMode('list')}
            >
              List
            </button>
            <button
              className={viewMode === 'grid' ? 'active' : ''}
              onClick={() => setViewMode('grid')}
            >
              Grid
            </button>
          </div>
          <button onClick={() => void refreshRecordings()}>Refresh</button>
        </div>

        <div className={`recording-list ${viewMode === 'grid' ? 'recording-grid' : ''}`}>
          {recordings.map((recording) => (
            <RecordingCard
              key={recording.id}
              recording={recording}
              selected={recording.id === selectedRecording?.id}
              viewMode={viewMode}
              onClick={() => void selectRecording(recording.id)}
            />
          ))}
          {recordings.length === 0 ? <p className="muted">{emptyMessage}</p> : null}
        </div>
      </div>

      <RecordingDetail recording={selectedRecording} onDelete={(id) => deleteRecording(id, false)} />
    </div>
  )
}
