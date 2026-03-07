import { useTranslation } from 'react-i18next'

type PrivacyToggleProps = {
  enabled: boolean
  onChange: (enabled: boolean) => Promise<void>
}

export function PrivacyToggle({ enabled, onChange }: PrivacyToggleProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="settings-row">
      <label htmlFor="local-only">{t('settings.localOnly')}</label>
      <input
        id="local-only"
        type="checkbox"
        checked={enabled}
        onChange={(event) => void onChange(event.target.checked)}
      />
      <span className="muted">{t('settings.localOnlyDesc')}</span>
    </div>
  )
}
