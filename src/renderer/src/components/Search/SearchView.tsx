import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { RAGAnswer, SearchHistoryEntry } from '../../../../shared/types'
import { QueryHistory } from './QueryHistory'
import { SearchResult } from './SearchResult'

const EMPTY_ANSWER: RAGAnswer = {
  answer: '',
  sources: []
}

type SearchStatus = 'loading' | 'ready' | 'model-unavailable' | 'empty-library'

export function SearchView(): React.JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState<RAGAnswer>(EMPTY_ANSWER)
  const [history, setHistory] = useState<SearchHistoryEntry[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isEmbedding, setIsEmbedding] = useState(false)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [status, setStatus] = useState<SearchStatus>('loading')
  const [error, setError] = useState<string | null>(null)

  const loadHistory = async (): Promise<void> => {
    try {
      const rows = await window.api.rag.searchHistory()
      setHistory(rows)
    } catch {
      // history load failed, non-critical
    }
  }

  const checkStatus = useCallback(async (): Promise<void> => {
    try {
      const [modelStatus, indexStatus] = await Promise.all([
        window.api.rag.embeddingModelStatus(),
        window.api.rag.indexStatus()
      ])

      if (!modelStatus.available) {
        setStatus('model-unavailable')
      } else if (indexStatus.vectorCount === 0) {
        setStatus('empty-library')
      } else {
        setStatus('ready')
      }
    } catch {
      // If status check fails, still show the page as ready
      // (the actual query will catch errors)
      setStatus('ready')
    }
  }, [])

  useEffect(() => {
    void checkStatus()
    void loadHistory()
    const unsubscribe = window.api.rag.onProgress((payload) => {
      setProgress(payload)
      if (payload.current >= payload.total) {
        setIsEmbedding(false)
        void checkStatus()
      }
    })
    return () => unsubscribe()
  }, [checkStatus])

  const runSearchWithQuery = useCallback(
    async (searchQuery: string): Promise<void> => {
      const trimmed = searchQuery.trim()
      if (!trimmed) return
      setIsSearching(true)
      setError(null)
      try {
        const result = await window.api.rag.query(trimmed, 5)
        setAnswer(result)
        await loadHistory()
      } catch {
        setError(t('search.errorMessage'))
        setAnswer(EMPTY_ANSWER)
      } finally {
        setIsSearching(false)
      }
    },
    [t]
  )

  const runSearch = async (): Promise<void> => {
    await runSearchWithQuery(query)
  }

  const runEmbed = async (): Promise<void> => {
    setIsEmbedding(true)
    setProgress({ current: 0, total: 0 })
    try {
      await window.api.rag.embedRecordings()
    } catch {
      setError(t('search.errorMessage'))
    } finally {
      setIsEmbedding(false)
    }
  }

  const handleResultClick = (recordingId: number, timestamp?: number): void => {
    const params = new URLSearchParams({ id: String(recordingId) })
    if (typeof timestamp === 'number') {
      params.set('t', String(timestamp))
    }
    navigate(`/?${params.toString()}`)
  }

  const handleHistorySelect = (value: string): void => {
    setQuery(value)
    void runSearchWithQuery(value)
  }

  // Model unavailable state
  if (status === 'model-unavailable') {
    return (
      <div className="search-layout">
        <div className="panel">
          <h3>{t('search.modelRequired')}</h3>
          <p className="muted">{t('search.modelRequiredDesc')}</p>
          <button onClick={() => navigate('/settings')}>{t('search.goToSettings')}</button>
        </div>
      </div>
    )
  }

  // Loading state while checking status
  if (status === 'loading') {
    return (
      <div className="search-layout">
        <div className="panel">
          <p className="muted">{t('search.searching')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="search-layout">
      <div className="panel">
        <h3>{t('search.title')}</h3>

        {status === 'empty-library' && <p className="muted">{t('search.emptyLibrary')}</p>}

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
          <button
            onClick={() => void runSearch()}
            disabled={isSearching || query.trim().length === 0}
          >
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

      {error ? (
        <div className="panel">
          <p className="error-text">{error}</p>
        </div>
      ) : null}

      <div className="search-grid">
        <QueryHistory items={history} onSelect={handleHistorySelect} />
        {isSearching ? (
          <div className="panel">
            <p className="muted">{t('search.searching')}</p>
          </div>
        ) : answer.answer ? (
          <SearchResult
            answer={answer.answer}
            sources={answer.sources}
            onSourceClick={handleResultClick}
          />
        ) : (
          <div className="panel">
            <p className="muted">{t('search.emptyPrompt')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
