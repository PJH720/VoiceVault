import { useEffect, useState } from 'react'
import type { LlmModelName, SupportedLocale, WhisperModelSize } from '../../../../shared/types'
import { useSummary } from '../../hooks/useSummary'
import { useTranscription } from '../../hooks/useTranscription'

export function SettingsView(): React.JSX.Element {
  const [locale, setLocale] = useState<SupportedLocale>('ko')
  const [version, setVersion] = useState('')
  const transcription = useTranscription()
  const summary = useSummary()

  useEffect(() => {
    window.api
      .getLocale()
      .then(setLocale)
      .catch(() => setLocale('ko'))
    window.api
      .getVersion()
      .then(setVersion)
      .catch(() => setVersion('-'))
  }, [])

  const saveLocale = async (nextLocale: SupportedLocale): Promise<void> => {
    const value = await window.api.setLocale(nextLocale)
    setLocale(value)
  }

  return (
    <div className="panel">
      <h3>Preferences</h3>
      <div className="settings-row">
        <label htmlFor="locale">Locale</label>
        <select
          id="locale"
          value={locale}
          onChange={(event) => void saveLocale(event.target.value as SupportedLocale)}
        >
          <option value="ko">Korean</option>
          <option value="en">English</option>
          <option value="ja">Japanese</option>
        </select>
      </div>
      <div className="settings-row">
        <label htmlFor="whisper-model">Whisper model</label>
        <select
          id="whisper-model"
          value={transcription.modelSize}
          onChange={(event) => void transcription.switchModel(event.target.value as WhisperModelSize)}
        >
          <option value="base">base</option>
          <option value="small">small</option>
          <option value="medium">medium</option>
          <option value="large-v3-turbo">large-v3-turbo</option>
        </select>
        <button onClick={() => void transcription.downloadModel(transcription.modelSize)}>
          Download
        </button>
      </div>
      <p className="muted">
        Model status: {transcription.modelAvailable ? 'downloaded' : 'missing'} / progress:{' '}
        {transcription.downloadProgress}%
      </p>
      {transcription.errorMessage ? <p className="error-text">{transcription.errorMessage}</p> : null}

      <div className="settings-row">
        <label htmlFor="llm-model">LLM model</label>
        <select
          id="llm-model"
          value={summary.llmModel}
          onChange={(event) => void summary.switchModel(event.target.value as LlmModelName)}
        >
          <option value="gemma-2-3n-instruct-q4_k_m">gemma-2-3n-instruct-q4_k_m</option>
          <option value="llama-3.2-3b-instruct-q4_k_m">llama-3.2-3b-instruct-q4_k_m</option>
        </select>
        <button onClick={() => void summary.downloadModel(summary.llmModel)}>Download</button>
      </div>
      <p className="muted">
        LLM status: {summary.modelAvailable ? 'downloaded' : 'missing'} / progress:{' '}
        {summary.downloadProgress}%
      </p>
      {summary.errorMessage ? <p className="error-text">{summary.errorMessage}</p> : null}
      <p className="muted">App version: {version}</p>
    </div>
  )
}
