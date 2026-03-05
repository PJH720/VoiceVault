import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { HashRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { RecordingProvider } from './contexts/RecordingContext'
import { LibraryProvider } from './contexts/LibraryContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { RecordingView } from './components/Recording/RecordingView'
import { LibraryView } from './components/Library/LibraryView'
import { SearchView } from './components/Search/SearchView'
import { SettingsView } from './components/Settings/SettingsView'

function AppContent(): React.JSX.Element {
  const { t } = useTranslation()
  const location = useLocation()
  const title = useMemo(() => {
    switch (location.pathname) {
      case '/':
        return t('nav.library')
      case '/record':
        return t('nav.record')
      case '/settings':
        return t('nav.settings')
      case '/search':
        return t('nav.search')
      default:
        return t('app.name')
    }
  }, [location.pathname, t])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1 className="sidebar-title">{t('app.name')}</h1>
        <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
          {t('nav.library')}
        </NavLink>
        <NavLink to="/record" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          {t('nav.record')}
        </NavLink>
        <NavLink to="/search" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          {t('nav.search')}
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          {t('nav.settings')}
        </NavLink>
      </aside>

      <main className="content">
        <header className="content-header">
          <h2>{title}</h2>
        </header>
        <section className="content-body">
          <Routes>
            <Route
              path="/"
              element={
                <ErrorBoundary>
                  <LibraryView />
                </ErrorBoundary>
              }
            />
            <Route
              path="/record"
              element={
                <ErrorBoundary>
                  <RecordingView />
                </ErrorBoundary>
              }
            />
            <Route
              path="/search"
              element={
                <ErrorBoundary>
                  <SearchView />
                </ErrorBoundary>
              }
            />
            <Route
              path="/settings"
              element={
                <ErrorBoundary>
                  <SettingsView />
                </ErrorBoundary>
              }
            />
          </Routes>
        </section>
      </main>
    </div>
  )
}

function App(): React.JSX.Element {
  return (
    <RecordingProvider>
      <LibraryProvider>
        <HashRouter>
          <AppContent />
        </HashRouter>
      </LibraryProvider>
    </RecordingProvider>
  )
}

export default App
