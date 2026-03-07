import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initI18n } from './i18n'
import type { SupportedLocale } from '../../shared/types'

async function bootstrap(): Promise<void> {
  let locale: SupportedLocale = 'en'
  try {
    locale = await window.api.getLocale()
  } catch {
    locale = 'en'
  }
  await initI18n(locale)
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

void bootstrap()
