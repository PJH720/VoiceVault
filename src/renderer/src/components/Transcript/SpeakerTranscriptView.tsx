import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { TranscriptSegment } from '../../../../shared/types'

type SpeakerTranscriptViewProps = {
  segments: Array<TranscriptSegment & { speaker: string }>
}

export function SpeakerTranscriptView({ segments }: SpeakerTranscriptViewProps): React.JSX.Element {
  const { t } = useTranslation()
  const groups = useMemo(() => {
    const bucket: Array<{
      speaker: string
      speakerName?: string
      speakerColor?: string
      items: Array<TranscriptSegment & { speaker: string }>
    }> = []
    for (const segment of segments) {
      const last = bucket[bucket.length - 1]
      if (last && last.speaker === segment.speaker) {
        last.items.push(segment)
        continue
      }
      bucket.push({
        speaker: segment.speaker,
        speakerName: segment.speakerName,
        speakerColor: segment.speakerColor,
        items: [segment]
      })
    }
    return bucket
  }, [segments])

  if (groups.length === 0) {
    return <div className="panel">{t('diarization.noSpeakerTranscript')}</div>
  }

  return (
    <div className="panel speaker-transcript">
      <h3>{t('diarization.transcriptTitle')}</h3>
      <div className="speaker-transcript-list">
        {groups.map((group, index) => (
          <div key={`${group.speaker}-${index}`} className="speaker-group">
            <div className="speaker-group-head">
              <span
                className="speaker-color-dot"
                style={{ backgroundColor: group.speakerColor ?? '#6b7280' }}
              />
              <span>{group.speakerName ?? group.speaker}</span>
            </div>
            {group.items.map((item, idx) => (
              <p key={`${item.start}-${item.end}-${idx}`}>{item.text}</p>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
