import type { SupportedLanguage } from '../../../../shared/types'
import { useTranslation } from 'react-i18next'

type LanguageSelectorProps = {
  targetLanguage: string
  languages: SupportedLanguage[]
  onChange: (language: string) => void | Promise<void>
}

export function LanguageSelector({
  targetLanguage,
  languages,
  onChange
}: LanguageSelectorProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="settings-row">
      <label htmlFor="translation-language">{t('translation.language')}</label>
      <select
        id="translation-language"
        value={targetLanguage}
        onChange={(event) => void onChange(event.target.value)}
      >
        {languages.map((language) => (
          <option key={language.code} value={language.code}>
            {language.name}
          </option>
        ))}
      </select>
    </div>
  )
}
