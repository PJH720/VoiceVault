import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SpeakerProfile } from '../../../../shared/types'

type SpeakerProfileManagerProps = {
  profiles: SpeakerProfile[]
  onCreate: (name: string) => Promise<void>
  onUpdate: (id: number, updates: { name?: string; color?: string }) => Promise<void>
  onMerge: (sourceId: number, targetId: number) => Promise<void>
}

export function SpeakerProfileManager({
  profiles,
  onCreate,
  onUpdate,
  onMerge
}: SpeakerProfileManagerProps): React.JSX.Element {
  const { t } = useTranslation()
  const [name, setName] = useState('')

  const create = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) return
    await onCreate(trimmed)
    setName('')
  }

  return (
    <div className="panel">
      <h3>{t('diarization.profilesTitle')}</h3>
      <div className="speaker-profile-create">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('diarization.speakerNamePlaceholder')}
        />
        <button onClick={() => void create()}>{t('diarization.add')}</button>
      </div>
      <ul className="speaker-profiles-list">
        {profiles.map((profile) => (
          <li key={profile.id}>
            <span className="speaker-color-dot" style={{ backgroundColor: profile.color }} />
            <input
              value={profile.name}
              onChange={(event) => void onUpdate(profile.id, { name: event.target.value })}
            />
            <span className="muted">
              {t('diarization.recordingSummary', {
                count: profile.recordingCount,
                duration: profile.totalDuration.toFixed(1)
              })}
            </span>
            {profiles
              .filter((candidate) => candidate.id !== profile.id)
              .slice(0, 1)
              .map((candidate) => (
                <button key={candidate.id} onClick={() => void onMerge(profile.id, candidate.id)}>
                  {t('diarization.mergeTo', { name: candidate.name })}
                </button>
              ))}
          </li>
        ))}
      </ul>
    </div>
  )
}
