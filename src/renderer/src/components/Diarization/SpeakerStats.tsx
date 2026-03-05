import type { SpeakerStats as SpeakerStatsType } from '../../../../shared/types'
import { useTranslation } from 'react-i18next'

type SpeakerStatsProps = {
  stats: SpeakerStatsType[]
}

export function SpeakerStats({ stats }: SpeakerStatsProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="panel">
      <h3>{t('diarization.statsTitle')}</h3>
      {stats.length === 0 ? (
        <p className="muted">{t('diarization.noStats')}</p>
      ) : (
        <ul className="speaker-stats-list">
          {stats.map((item) => (
            <li key={item.speaker}>
              <strong>{item.speaker}</strong> -{' '}
              {t('diarization.statsLine', {
                percentage: item.percentage.toFixed(1),
                duration: item.totalDuration.toFixed(1),
                turns: item.turnCount
              })}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
