import { useTranslation } from 'react-i18next'

type MixerControlsProps = {
  mixMode: 'mic-only' | 'system-only' | 'both'
  micVolume: number
  systemVolume: number
  onMicVolumeChange: (value: number) => void
  onSystemVolumeChange: (value: number) => void
}

export function MixerControls({
  mixMode,
  micVolume,
  systemVolume,
  onMicVolumeChange,
  onSystemVolumeChange
}: MixerControlsProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="system-audio-mixer">
      {(mixMode === 'mic-only' || mixMode === 'both') && (
        <label>
          {t('audio.micVolume', { value: Math.round(micVolume * 100) })}
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(micVolume * 100)}
            onChange={(event) => onMicVolumeChange(Number(event.target.value) / 100)}
          />
        </label>
      )}
      {(mixMode === 'system-only' || mixMode === 'both') && (
        <label>
          {t('audio.systemVolume', { value: Math.round(systemVolume * 100) })}
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(systemVolume * 100)}
            onChange={(event) => onSystemVolumeChange(Number(event.target.value) / 100)}
          />
        </label>
      )}
    </div>
  )
}
