import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import type { SupportedLocale } from '../../../shared/types'
import ko from './locales/ko.json'
import en from './locales/en.json'
import ja from './locales/ja.json'

const resources = {
  ko: { translation: ko },
  en: { translation: en },
  ja: { translation: ja }
}

let initialized = false

export async function initI18n(locale: SupportedLocale): Promise<void> {
  if (initialized) {
    await i18n.changeLanguage(locale)
    return
  }
  await i18n.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false
  })
  initialized = true
}

export default i18n
