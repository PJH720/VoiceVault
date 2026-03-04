import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { RecordingDetail } from './RecordingDetail'
import { RecordingCard } from './RecordingCard'
import { useLibraryContext } from '../../hooks/useLibraryContext'

export function LibraryView(): React.JSX.Element {
  const { t } = useTranslation()
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
    () => (searchQuery ? t('library.emptySearch') : t('library.empty')),
    [searchQuery, t]
  )

  return (
    <div className="library-layout">
      <div className="panel">
        <div className="search-row library-toolbar">
          <input
            placeholder={t('library.searchPlaceholder')}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}>
            <option value="createdAt">{t('library.sortNewest')}</option>
            <option value="duration">{t('library.sortDuration')}</option>
            <option value="title">{t('library.sortTitle')}</option>
          </select>
          <div className="view-toggle">
            <button
              className={viewMode === 'list' ? 'active' : ''}
              onClick={() => setViewMode('list')}
            >
              {t('library.viewList')}
            </button>
            <button
              className={viewMode === 'grid' ? 'active' : ''}
              onClick={() => setViewMode('grid')}
            >
              {t('library.viewGrid')}
            </button>
          </div>
          <button onClick={() => void refreshRecordings()}>{t('library.refresh')}</button>
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
