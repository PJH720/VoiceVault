type LanguageBadgeProps = {
  language: string
}

export function LanguageBadge({ language }: LanguageBadgeProps): React.JSX.Element {
  if (!language || language === 'auto') {
    return <span className="lang-badge">AUTO</span>
  }
  return <span className="lang-badge">{language.toUpperCase()}</span>
}
