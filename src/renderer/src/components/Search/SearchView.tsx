import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RAGAnswer, SearchHistoryEntry } from '../../../../shared/types'
import { QueryHistory } from './QueryHistory'
import { SearchResult } from './SearchResult'

const EMPTY_ANSWER: RAGAnswer = {
  answer: '',
  sources: []
}

export function SearchView(): React.JSX.Element {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState<RAGAnswer>(EMPTY_ANSWER)
  const [history, setHistory] = useState<SearchHistoryEntry[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isEmbedding, setIsEmbedding] = useState(false)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)

  const loadHistory = async (): Promise<void> => {
    const rows = await window.api.rag.searchHistory()
    setHistory(rows)
  }

  useEffect(() => {
    void loadHistory()
    const unsubscribe = window.api.rag.onProgress((payload) => {
      setProgress(payload)
      if (payload.current >= payload.total) {
        setIsEmbedding(false)
      }
    })
    return () => unsubscribe()
  }, [])

  const runSearch = async (): Promise<void> => {
    const trimmed = query.trim()
    if (!trimmed) return
    setIsSearching(true)
    try {
      const result = await window.api.rag.query(trimmed, 5)
      setAnswer(result)
      await loadHistory()
    } finally {
      setIsSearching(false)
    }
  }

  const runEmbed = async (): Promise<void> => {
    setIsEmbedding(true)
    setProgress({ current: 0, total: 0 })
    try {
      await window.api.rag.embedRecordings()
    } finally {
      setIsEmbedding(false)
    }
  }

  return (
    <div className="search-layout">
      <div className="panel">
        <h3>{t('search.title')}</h3>
        <div className="search-input-row">
          <input
            placeholder={t('search.placeholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void runSearch()
              }
            }}
          />
          <button onClick={() => void runSearch()} disabled={isSearching || query.trim().length === 0}>
            {isSearching ? t('search.searching') : t('search.search')}
          </button>
          <button onClick={() => void runEmbed()} disabled={isEmbedding}>
            {isEmbedding ? t('search.embedding') : t('search.embed')}
          </button>
        </div>
        {progress ? (
          <p className="muted">
            {t('search.embeddingProgress', { current: progress.current, total: progress.total })}
          </p>
        ) : null}
      </div>

      <div className="search-grid">
        <QueryHistory
          items={history}
          onSelect={(value) => {
            setQuery(value)
            void runSearch()
          }}
        />
        {answer.answer ? (
          <SearchResult answer={answer.answer} sources={answer.sources} />
        ) : (
          <div className="panel">
            <p className="muted">{t('search.emptyPrompt')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
