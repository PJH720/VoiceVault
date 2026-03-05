import { useTranslation } from 'react-i18next'
import type { SupportedLocale } from '../../../../shared/types'
import { useLocale } from '../../hooks/useLocale'

export function LanguagePicker(): React.JSX.Element {
  const { t } = useTranslation()
  const { locale, locales, setLocale } = useLocale()

  return (
    <div className="settings-row">
      <label htmlFor="locale">{t('settings.language')}</label>
      <select id="locale" value={locale} onChange={(event) => void setLocale(event.target.value as SupportedLocale)}>
        {locales.map((item) => (
          <option key={item.code} value={item.code}>
            {item.nativeName}
          </option>
        ))}
      </select>
    </div>
  )
}
