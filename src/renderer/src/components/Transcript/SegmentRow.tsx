import type { TranscriptSegment } from '../../../../shared/types'
import { useTranslation } from 'react-i18next'

type SegmentRowProps = {
  segment: TranscriptSegment
  onSeek?: (seconds: number) => void
}

function formatTime(value: number): string {
  const safe = Number.isFinite(value) && value >= 0 ? value : 0
  const mm = String(Math.floor(safe / 60)).padStart(2, '0')
  const ss = String(Math.floor(safe % 60)).padStart(2, '0')
  const ms = String(Math.floor((safe % 1) * 10))
  return `${mm}:${ss}.${ms}`
}

export function SegmentRow({ segment, onSeek }: SegmentRowProps): React.JSX.Element {
  const { t } = useTranslation()
  const copyText = async (): Promise<void> => {
    await navigator.clipboard.writeText(segment.text)
  }

  return (
    <div className="segment-row">
      <button className="segment-time" onClick={() => onSeek?.(segment.start)}>
        {formatTime(segment.start)}
      </button>
      <div className="segment-body">
        <p className="segment-text">{segment.text}</p>
        <div className="segment-meta">
          <span>{segment.language.toUpperCase()}</span>
          <span>{Math.round(segment.confidence * 100)}%</span>
          <button onClick={() => void copyText()}>{t('transcript.copy')}</button>
        </div>
      </div>
    </div>
  )
}
