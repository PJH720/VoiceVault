import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LlmModelName, WhisperModelSize } from '../../../../shared/types'
import { LLMSettings } from './LLMSettings'
import { TemplateLibrary } from '../Templates/TemplateLibrary'
import { AudioSourceSelector } from '../Audio/AudioSourceSelector'
import { LanguagePicker } from './LanguagePicker'
import { useSummary } from '../../hooks/useSummary'
import { useTranscription } from '../../hooks/useTranscription'

export function SettingsView(): React.JSX.Element {
  const { t } = useTranslation()
  const [version, setVersion] = useState('')
  const [vaultPath, setVaultPath] = useState<string | null>(null)
  const transcription = useTranscription()
  const summary = useSummary()

  useEffect(() => {
    window.api
      .getVersion()
      .then(setVersion)
      .catch(() => setVersion('-'))
    window.api.export
      .getVaultPath()
      .then((result) => setVaultPath(result.path))
      .catch(() => setVaultPath(null))
  }, [])

  const selectVaultPath = async (): Promise<void> => {
    const result = await window.api.export.setVaultPath()
    if (result.path) {
      setVaultPath(result.path)
    }
  }

  return (
    <div className="settings-stack">
      {!transcription.modelAvailable && !summary.modelAvailable ? (
        <div className="panel first-launch-guide">
          <h3>{t('settings.firstLaunchTitle')}</h3>
          <p className="muted">{t('settings.firstLaunchWhisper')}</p>
          <p className="muted">{t('settings.firstLaunchLlm')}</p>
        </div>
      ) : null}
      <div className="panel">
        <h3>{t('settings.preferences')}</h3>
        <LanguagePicker />
        <div className="settings-row">
          <label htmlFor="whisper-model">{t('settings.whisperModel')}</label>
          <select
            id="whisper-model"
            value={transcription.modelSize}
            onChange={(event) =>
              void transcription.switchModel(event.target.value as WhisperModelSize)
            }
          >
            <option value="base">base</option>
            <option value="small">small</option>
            <option value="medium">medium</option>
            <option value="large-v3-turbo">large-v3-turbo</option>
          </select>
          <button onClick={() => void transcription.downloadModel(transcription.modelSize)}>
            {t('settings.download')}
          </button>
        </div>
        <p className="muted">
          {t('settings.whisperModel')}:{' '}
          {transcription.modelAvailable ? t('common.downloaded') : t('common.missing')} /{' '}
          {t('settings.progress')}: {transcription.downloadProgress}%
        </p>
        {transcription.errorMessage ? (
          <p className="error-text">{transcription.errorMessage}</p>
        ) : null}

        <div className="settings-row">
          <label htmlFor="llm-model">{t('settings.llmModel')}</label>
          <select
            id="llm-model"
            value={summary.llmModel}
            onChange={(event) => void summary.switchModel(event.target.value as LlmModelName)}
          >
            <option value="gemma-2-3n-instruct-q4_k_m">gemma-2-3n-instruct-q4_k_m</option>
            <option value="llama-3.2-3b-instruct-q4_k_m">llama-3.2-3b-instruct-q4_k_m</option>
          </select>
          <button onClick={() => void summary.downloadModel(summary.llmModel)}>
            {t('settings.download')}
          </button>
        </div>
        <p className="muted">
          {t('settings.llmModel')}:{' '}
          {summary.modelAvailable ? t('common.downloaded') : t('common.missing')} /{' '}
          {t('settings.progress')}: {summary.downloadProgress}%
        </p>
        {summary.errorMessage ? <p className="error-text">{summary.errorMessage}</p> : null}
        <p className="muted">
          {t('settings.version')}: {version}
        </p>
      </div>

      <div className="panel">
        <h3>{t('export.title')}</h3>
        <div className="settings-row">
          <label>{t('export.vault')}</label>
          <span className="muted">{vaultPath ?? t('export.vaultNotSelected')}</span>
          <button onClick={() => void selectVaultPath()}>{t('export.select')}</button>
        </div>
      </div>

      <LLMSettings />
      <AudioSourceSelector />
      <TemplateLibrary />
    </div>
  )
}
