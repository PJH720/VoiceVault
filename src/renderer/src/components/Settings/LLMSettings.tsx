import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CloudModelName } from '../../../../shared/types'
import { useSummary } from '../../hooks/useSummary'
import { PrivacyToggle } from './PrivacyToggle'

export function LLMSettings(): React.JSX.Element {
  const { t } = useTranslation()
  const summary = useSummary()
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [maskedKey, setMaskedKey] = useState<string | null>(null)

  useEffect(() => {
    void summary.getMaskedApiKey().then(setMaskedKey)
  }, [summary])

  const saveApiKey = async (): Promise<void> => {
    if (!apiKeyInput.trim()) return
    await summary.setApiKey(apiKeyInput.trim())
    setApiKeyInput('')
    setMaskedKey(await summary.getMaskedApiKey())
  }

  return (
    <div className="panel">
      <h3>{t('settings.cloudLlmTitle')}</h3>

      <div className="settings-row">
        <label htmlFor="provider">{t('settings.provider')}</label>
        <select
          id="provider"
          value={summary.provider}
          onChange={(event) => void summary.switchProvider(event.target.value as 'local' | 'cloud')}
        >
          <option value="local">{t('settings.providerLocal')}</option>
          <option value="cloud">{t('settings.providerCloud')}</option>
        </select>
      </div>

      <div className="settings-row">
        <label htmlFor="api-key">{t('settings.apiKey')}</label>
        <input
          id="api-key"
          type="password"
          placeholder={t('settings.apiKeyPlaceholder')}
          value={apiKeyInput}
          onChange={(event) => setApiKeyInput(event.target.value)}
          disabled={summary.localOnlyMode}
        />
        <button onClick={() => void saveApiKey()} disabled={summary.localOnlyMode}>
          {t('settings.save')}
        </button>
      </div>
      {maskedKey ? <p className="muted">{t('settings.currentKey')}: {maskedKey}</p> : null}

      <div className="settings-row">
        <label htmlFor="cloud-model">{t('settings.cloudModel')}</label>
        <select
          id="cloud-model"
          value={summary.cloudModel}
          onChange={(event) => void summary.switchCloudModel(event.target.value as CloudModelName)}
          disabled={summary.localOnlyMode}
        >
          <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
          <option value="claude-3-opus-20240229">Claude 3 Opus</option>
          <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
        </select>
      </div>

      <PrivacyToggle enabled={summary.localOnlyMode} onChange={summary.setLocalOnlyMode} />

      <p className="muted">
        {t('settings.usage', {
          requests: summary.usageStats.totalRequests,
          cost: summary.usageStats.totalCost.toFixed(4)
        })}
      </p>
      <button onClick={() => void summary.resetUsageStats()}>{t('settings.resetStats')}</button>
      <p className="muted">
        {t('settings.privacyNotice')}
      </p>
    </div>
  )
}
