import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RecordingProvider } from './contexts/RecordingContext'
import { LibraryProvider } from './contexts/LibraryContext'
import { RecordingView } from './components/Recording/RecordingView'
import { LibraryView } from './components/Library/LibraryView'
import { SearchView } from './components/Search/SearchView'
import { SettingsView } from './components/Settings/SettingsView'

type Page = 'library' | 'record' | 'search' | 'settings'

function AppContent(): React.JSX.Element {
  const { t } = useTranslation()
  const [page, setPage] = useState<Page>('library')
  const title = useMemo(() => {
    switch (page) {
      case 'library':
        return t('nav.library')
      case 'record':
        return t('nav.record')
      case 'settings':
        return t('nav.settings')
      case 'search':
        return t('nav.search')
      default:
        return t('app.name')
    }
  }, [page, t])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1 className="sidebar-title">{t('app.name')}</h1>
        <button
          className={`nav-item ${page === 'library' ? 'active' : ''}`}
          onClick={() => setPage('library')}
        >
          {t('nav.library')}
        </button>
        <button
          className={`nav-item ${page === 'record' ? 'active' : ''}`}
          onClick={() => setPage('record')}
        >
          {t('nav.record')}
        </button>
        <button
          className={`nav-item ${page === 'search' ? 'active' : ''}`}
          onClick={() => setPage('search')}
        >
          {t('nav.search')}
        </button>
        <button
          className={`nav-item ${page === 'settings' ? 'active' : ''}`}
          onClick={() => setPage('settings')}
        >
          {t('nav.settings')}
        </button>
      </aside>

      <main className="content">
        <header className="content-header">
          <h2>{title}</h2>
        </header>
        <section className="content-body">
          {page === 'library' && <LibraryView />}
          {page === 'record' && <RecordingView />}
          {page === 'search' && <SearchView />}
          {page === 'settings' && <SettingsView />}
        </section>
      </main>
    </div>
  )
}

function App(): React.JSX.Element {
  return (
    <RecordingProvider>
      <LibraryProvider>
        <AppContent />
      </LibraryProvider>
    </RecordingProvider>
  )
}

export default App
