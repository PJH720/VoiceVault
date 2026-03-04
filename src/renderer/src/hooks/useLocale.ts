import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { LocaleMetadata, SupportedLocale } from '../../../shared/types'

export const LOCALES: LocaleMetadata[] = [
  { code: 'ko', name: 'Korean', nativeName: '한국어', direction: 'ltr', complete: true },
  { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr', complete: true },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', direction: 'ltr', complete: true }
]

export function useLocale(): {
  locale: SupportedLocale
  locales: LocaleMetadata[]
  setLocale: (locale: SupportedLocale) => Promise<void>
} {
  const { i18n } = useTranslation()
  const current = (i18n.language?.slice(0, 2) ?? 'en') as SupportedLocale

  const setLocale = useCallback(
    async (locale: SupportedLocale): Promise<void> => {
      await i18n.changeLanguage(locale)
      await window.api.setLocale(locale)
      document.documentElement.lang = locale
    },
    [i18n]
  )

  return {
    locale: current,
    locales: LOCALES,
    setLocale
  }
}
