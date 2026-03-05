import type { SearchHistoryEntry } from '../../../../shared/types'
import { useTranslation } from 'react-i18next'

type QueryHistoryProps = {
  items: SearchHistoryEntry[]
  onSelect: (query: string) => void
}

export function QueryHistory({ items, onSelect }: QueryHistoryProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="panel">
      <h3>{t('search.recent')}</h3>
      {items.length === 0 ? (
        <p className="muted">{t('search.noHistory')}</p>
      ) : (
        <ul className="search-history-list">
          {items.map((entry) => (
            <li key={entry.id}>
              <button className="search-history-item" onClick={() => onSelect(entry.query)}>
                <span>{entry.query}</span>
                <span className="muted">
                  {t('search.resultsCount', { count: entry.resultCount })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
