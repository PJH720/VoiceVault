import type { RAGSource } from '../../../../shared/types'
import { useTranslation } from 'react-i18next'

type SearchResultProps = {
  answer: string
  sources: RAGSource[]
  onSourceClick?: (recordingId: number, timestamp?: number) => void
}

function formatTimestamp(seconds?: number): string {
  if (typeof seconds !== 'number') return ''
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function SearchResult({
  answer,
  sources,
  onSourceClick
}: SearchResultProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="search-results">
      <div className="panel">
        <h3>{t('search.answer')}</h3>
        <p>{answer}</p>
      </div>
      <div className="panel">
        <h3>{t('search.sources')}</h3>
        {sources.length === 0 ? (
          <p className="muted">{t('search.noSources')}</p>
        ) : (
          <div className="search-sources">
            {sources.map((source, index) => (
              <div
                key={`${source.recordingId}-${index}`}
                className="search-source-item"
                role="button"
                tabIndex={0}
                style={{ cursor: onSourceClick ? 'pointer' : 'default' }}
                onClick={() => onSourceClick?.(source.recordingId, source.timestamp)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    onSourceClick?.(source.recordingId, source.timestamp)
                  }
                }}
              >
                <div className="search-source-head">
                  <span className="summary-chip">[{index + 1}]</span>
                  <strong>{source.recordingTitle}</strong>
                  {typeof source.timestamp === 'number' ? (
                    <span className="muted">{formatTimestamp(source.timestamp)}</span>
                  ) : null}
                  {source.speaker ? <span className="summary-chip">{source.speaker}</span> : null}
                </div>
                <p>{source.text}</p>
                <div className="muted">
                  {t('search.relevance', { value: (source.relevance * 100).toFixed(1) })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
