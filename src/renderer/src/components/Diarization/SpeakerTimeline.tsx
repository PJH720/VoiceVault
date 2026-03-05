import type { SpeakerSegment } from '../../../../shared/types'
import { useTranslation } from 'react-i18next'

type SpeakerTimelineProps = {
  segments: SpeakerSegment[]
  duration: number
}

function speakerColor(speaker: string): string {
  const palette: Record<string, string> = {
    SPEAKER_00: '#3b82f6',
    SPEAKER_01: '#ef4444',
    SPEAKER_02: '#10b981',
    SPEAKER_03: '#f59e0b'
  }
  return palette[speaker] ?? '#6b7280'
}

export function SpeakerTimeline({ segments, duration }: SpeakerTimelineProps): React.JSX.Element {
  const { t } = useTranslation()
  if (segments.length === 0 || duration <= 0) {
    return <div className="panel">{t('diarization.noTimeline')}</div>
  }

  return (
    <div className="panel">
      <h3>{t('diarization.timelineTitle')}</h3>
      <div className="speaker-timeline">
        {segments.map((segment, index) => {
          const left = (segment.start / duration) * 100
          const width = ((segment.end - segment.start) / duration) * 100
          return (
            <div
              key={`${segment.start}-${segment.end}-${index}`}
              className="speaker-timeline-block"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                backgroundColor: speakerColor(segment.speaker)
              }}
              title={t('diarization.timelineTooltip', {
                speaker: segment.speaker,
                start: segment.start.toFixed(1),
                end: segment.end.toFixed(1)
              })}
            />
          )
        })}
      </div>
    </div>
  )
}
