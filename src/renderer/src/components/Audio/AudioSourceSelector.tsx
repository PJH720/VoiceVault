import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  AudioPermissionStatus,
  AudioSourceInfo,
  CaptureConfig
} from '../../../../shared/types'
import { MixerControls } from './MixerControls'
import { PermissionPrompt } from './PermissionPrompt'

const defaultConfig: CaptureConfig = {
  mixMode: 'mic-only',
  micVolume: 1,
  systemVolume: 1
}

export function AudioSourceSelector(): React.JSX.Element {
  const { t } = useTranslation()
  const [sources, setSources] = useState<AudioSourceInfo[]>([])
  const [permissions, setPermissions] = useState<AudioPermissionStatus>({
    screenRecording: true,
    microphone: true
  })
  const [config, setConfig] = useState<CaptureConfig>(defaultConfig)
  const [message, setMessage] = useState<string | null>(null)

  const micSources = useMemo(() => sources.filter((source) => source.type === 'input'), [sources])
  const systemSources = useMemo(
    () => sources.filter((source) => source.type === 'output' || source.type === 'app'),
    [sources]
  )

  const load = async (): Promise<void> => {
    const [sourceResult, permissionResult] = await Promise.all([
      window.api.systemAudio.listSources(),
      window.api.systemAudio.checkPermissions()
    ])
    setSources(sourceResult.sources)
    setPermissions(permissionResult)
    const defaultMic = sourceResult.sources.find((item) => item.type === 'input' && item.isDefault)
    const defaultSystem = sourceResult.sources.find(
      (item) => item.type !== 'input' && item.isDefault
    )
    setConfig((prev) => ({
      ...prev,
      micSource: prev.micSource ?? defaultMic?.id,
      systemSource: prev.systemSource ?? defaultSystem?.id
    }))
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [])

  const requestPermission = async (type: 'screen' | 'microphone'): Promise<void> => {
    const result = await window.api.systemAudio.requestPermissions(type)
    setPermissions(result.permissions)
  }

  const apply = async (): Promise<void> => {
    try {
      await window.api.systemAudio.startCapture(config)
      setMessage(t('audio.started'))
    } catch (error) {
      setMessage((error as Error).message)
    }
  }

  const stop = async (): Promise<void> => {
    await window.api.systemAudio.stopCapture()
    setMessage(t('audio.stopped'))
  }

  return (
    <div className="panel">
      <h3>{t('audio.title')}</h3>
      {!permissions.microphone && (
        <PermissionPrompt
          type="microphone"
          title={t('audio.micPermissionTitle')}
          message={t('audio.micPermissionMessage')}
          onRequest={requestPermission}
        />
      )}
      {!permissions.screenRecording && (
        <PermissionPrompt
          type="screen"
          title={t('audio.screenPermissionTitle')}
          message={t('audio.screenPermissionMessage')}
          onRequest={requestPermission}
        />
      )}

      <div className="settings-row">
        <label htmlFor="mix-mode">{t('audio.captureMode')}</label>
        <select
          id="mix-mode"
          value={config.mixMode}
          onChange={(event) =>
            setConfig((prev) => ({
              ...prev,
              mixMode: event.target.value as CaptureConfig['mixMode']
            }))
          }
        >
          <option value="mic-only">{t('audio.micOnly')}</option>
          <option value="system-only">{t('audio.systemOnly')}</option>
          <option value="both">{t('audio.both')}</option>
        </select>
      </div>

      {(config.mixMode === 'mic-only' || config.mixMode === 'both') && (
        <div className="settings-row">
          <label htmlFor="mic-source">{t('audio.micSource')}</label>
          <select
            id="mic-source"
            value={config.micSource ?? ''}
            onChange={(event) => setConfig((prev) => ({ ...prev, micSource: event.target.value }))}
          >
            <option value="">{t('audio.selectMic')}</option>
            {micSources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name} {source.isDefault ? t('audio.default') : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {(config.mixMode === 'system-only' || config.mixMode === 'both') && (
        <div className="settings-row">
          <label htmlFor="system-source">{t('audio.systemSource')}</label>
          <select
            id="system-source"
            value={config.systemSource ?? ''}
            onChange={(event) =>
              setConfig((prev) => ({ ...prev, systemSource: event.target.value }))
            }
          >
            <option value="">{t('audio.selectSystem')}</option>
            {systemSources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.type === 'app' ? '🎯 ' : ''}
                {source.name} {source.isDefault ? t('audio.default') : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <MixerControls
        mixMode={config.mixMode}
        micVolume={config.micVolume}
        systemVolume={config.systemVolume}
        onMicVolumeChange={(value) => setConfig((prev) => ({ ...prev, micVolume: value }))}
        onSystemVolumeChange={(value) => setConfig((prev) => ({ ...prev, systemVolume: value }))}
      />

      <div className="system-audio-actions">
        <button onClick={() => void load()}>{t('audio.refresh')}</button>
        <button onClick={() => void apply()}>{t('audio.start')}</button>
        <button onClick={() => void stop()}>{t('audio.stop')}</button>
      </div>
      {message ? <p className="muted">{message}</p> : null}
    </div>
  )
}
