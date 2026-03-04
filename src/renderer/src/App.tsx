import { useMemo, useState } from 'react'
import { RecordingProvider } from './contexts/RecordingContext'
import { LibraryProvider } from './contexts/LibraryContext'
import { RecordingView } from './components/Recording/RecordingView'
import { LibraryView } from './components/Library/LibraryView'
import { SettingsView } from './components/Settings/SettingsView'

type Page = 'library' | 'record' | 'settings'

function AppContent(): React.JSX.Element {
  const [page, setPage] = useState<Page>('library')
  const title = useMemo(() => {
    switch (page) {
      case 'library':
        return 'Library'
      case 'record':
        return 'Record'
      case 'settings':
        return 'Settings'
      default:
        return 'VoiceVault'
    }
  }, [page])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1 className="sidebar-title">VoiceVault</h1>
        <button
          className={`nav-item ${page === 'library' ? 'active' : ''}`}
          onClick={() => setPage('library')}
        >
          Library
        </button>
        <button
          className={`nav-item ${page === 'record' ? 'active' : ''}`}
          onClick={() => setPage('record')}
        >
          Record
        </button>
        <button
          className={`nav-item ${page === 'settings' ? 'active' : ''}`}
          onClick={() => setPage('settings')}
        >
          Settings
        </button>
      </aside>

      <main className="content">
        <header className="content-header">
          <h2>{title}</h2>
        </header>
        <section className="content-body">
          {page === 'library' && <LibraryView />}
          {page === 'record' && <RecordingView />}
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
