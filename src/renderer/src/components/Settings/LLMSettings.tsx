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
  const [openaiApiKeyInput, setOpenaiApiKeyInput] = useState('')
  const [maskedOpenaiKey, setMaskedOpenaiKey] = useState<string | null>(null)
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState('')
  const [maskedGeminiKey, setMaskedGeminiKey] = useState<string | null>(null)
  const [openaiKeyError, setOpenaiKeyError] = useState<string | null>(null)
  const [geminiKeyError, setGeminiKeyError] = useState<string | null>(null)
  const [testingConnection, setTestingConnection] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    void summary.getMaskedApiKey().then(setMaskedKey)
    void window.api.cloudLLM.getOpenAIApiKey().then((result) => setMaskedOpenaiKey(result.key))
    void window.api.cloudLLM.getGeminiApiKey().then((result) => setMaskedGeminiKey(result.key))
  }, [summary])

  const saveApiKey = async (): Promise<void> => {
    if (!apiKeyInput.trim()) return
    await summary.setApiKey(apiKeyInput.trim())
    setApiKeyInput('')
    setMaskedKey(await summary.getMaskedApiKey())
  }

  const saveOpenaiApiKey = async (): Promise<void> => {
    if (!openaiApiKeyInput.trim()) return
    setOpenaiKeyError(null)
    try {
      await window.api.cloudLLM.setOpenAIApiKey(openaiApiKeyInput.trim())
      setOpenaiApiKeyInput('')
      const result = await window.api.cloudLLM.getOpenAIApiKey()
      setMaskedOpenaiKey(result.key)
    } catch (error) {
      setOpenaiKeyError((error as Error).message)
    }
  }

  const saveGeminiApiKey = async (): Promise<void> => {
    if (!geminiApiKeyInput.trim()) return
    setGeminiKeyError(null)
    try {
      await window.api.cloudLLM.setGeminiApiKey(geminiApiKeyInput.trim())
      setGeminiApiKeyInput('')
      const result = await window.api.cloudLLM.getGeminiApiKey()
      setMaskedGeminiKey(result.key)
    } catch (error) {
      setGeminiKeyError((error as Error).message)
    }
  }

  const testConnection = async (): Promise<void> => {
    setTestingConnection(true)
    setTestResult(null)
    try {
      if (summary.localOnlyMode) {
        setTestResult({ success: false, message: t('settings.localOnlyDesc') })
        return
      }
      await window.api.cloudLLM.summarize('Connection test', summary.cloudModel)
      setTestResult({ success: true, message: t('settings.testSuccess') })
    } catch (error) {
      setTestResult({
        success: false,
        message: (error as Error).message
      })
    } finally {
      setTestingConnection(false)
    }
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
        <label htmlFor="api-key">{t('settings.apiKey')} (Anthropic)</label>
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
      {maskedKey ? (
        <p className="muted">
          {t('settings.currentKey')}: {maskedKey}
        </p>
      ) : null}

      <div className="settings-row">
        <label htmlFor="openai-api-key">OpenAI API Key</label>
        <input
          id="openai-api-key"
          type="password"
          placeholder="sk-..."
          value={openaiApiKeyInput}
          onChange={(event) => setOpenaiApiKeyInput(event.target.value)}
          disabled={summary.localOnlyMode}
        />
        <button onClick={() => void saveOpenaiApiKey()} disabled={summary.localOnlyMode}>
          {t('settings.save')}
        </button>
      </div>
      {openaiKeyError ? <p className="error-text">{openaiKeyError}</p> : null}
      {maskedOpenaiKey ? (
        <p className="muted">
          {t('settings.currentKey')}: {maskedOpenaiKey}
        </p>
      ) : null}

      <div className="settings-row">
        <label htmlFor="gemini-api-key">Gemini API Key</label>
        <input
          id="gemini-api-key"
          type="password"
          placeholder="AI..."
          value={geminiApiKeyInput}
          onChange={(event) => setGeminiApiKeyInput(event.target.value)}
          disabled={summary.localOnlyMode}
        />
        <button onClick={() => void saveGeminiApiKey()} disabled={summary.localOnlyMode}>
          {t('settings.save')}
        </button>
      </div>
      {geminiKeyError ? <p className="error-text">{geminiKeyError}</p> : null}
      {maskedGeminiKey ? (
        <p className="muted">
          {t('settings.currentKey')}: {maskedGeminiKey}
        </p>
      ) : null}

      <div className="settings-row">
        <label htmlFor="cloud-model">{t('settings.cloudModel')}</label>
        <select
          id="cloud-model"
          value={summary.cloudModel}
          onChange={(event) => void summary.switchCloudModel(event.target.value as CloudModelName)}
          disabled={summary.localOnlyMode}
        >
          <optgroup label="Anthropic">
            <option value="claude-sonnet-4-5-20250514">Claude Sonnet 4.5</option>
            <option value="claude-opus-4-6-20250612">Claude Opus 4.6</option>
            <option value="claude-haiku-3-5-20241022">Claude Haiku 3.5</option>
            <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
            <option value="claude-3-opus-20240229">Claude 3 Opus</option>
            <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
          </optgroup>
          <optgroup label="OpenAI">
            <option value="gpt-4o">GPT-4o</option>
            <option value="gpt-4o-mini">GPT-4o Mini</option>
          </optgroup>
          <optgroup label="Google">
            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
            <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
          </optgroup>
        </select>
      </div>

      <div className="settings-row">
        <button
          onClick={() => void testConnection()}
          disabled={testingConnection || summary.localOnlyMode}
        >
          {testingConnection ? `${t('settings.testConnection')}…` : t('settings.testConnection')}
        </button>
        {testResult ? (
          <span className={testResult.success ? 'success-text' : 'error-text'}>
            {testResult.message}
          </span>
        ) : null}
      </div>

      <PrivacyToggle enabled={summary.localOnlyMode} onChange={summary.setLocalOnlyMode} />

      <p className="muted">
        {t('settings.usage', {
          requests: summary.usageStats.totalRequests,
          cost: summary.usageStats.totalCost.toFixed(4)
        })}
      </p>
      <button onClick={() => void summary.resetUsageStats()}>{t('settings.resetStats')}</button>
      <p className="muted">{t('settings.privacyNotice')}</p>
    </div>
  )
}
