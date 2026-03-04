import { useTranslation } from 'react-i18next'

type LanguageBadgeProps = {
  language: string
}

export function LanguageBadge({ language }: LanguageBadgeProps): React.JSX.Element {
  const { t } = useTranslation()
  if (!language || language === 'auto') {
    return <span className="lang-badge">{t('common.auto')}</span>
  }
  return <span className="lang-badge">{language.toUpperCase()}</span>
}
