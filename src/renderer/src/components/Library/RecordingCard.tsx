import type { RecordingWithTranscript } from '../../../../shared/types'
import { useTranslation } from 'react-i18next'
import { ClassificationBadge } from '../Templates/ClassificationBadge'

type RecordingCardProps = {
  recording: RecordingWithTranscript
  selected: boolean
  viewMode: 'list' | 'grid'
  onClick: () => void
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return value
  return date.toLocaleString()
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const mm = String(Math.floor(safe / 60)).padStart(2, '0')
  const ss = String(safe % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export function RecordingCard({
  recording,
  selected,
  viewMode,
  onClick
}: RecordingCardProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <button
      className={`recording-row ${selected ? 'selected' : ''} ${viewMode === 'grid' ? 'recording-grid-card' : ''}`}
      onClick={onClick}
    >
      <div className="recording-title">{recording.title}</div>
      <div className="recording-meta">
        <span>{formatDate(recording.createdAt)}</span>
        <span>{formatDuration(recording.duration)}</span>
      </div>
      <div className="recording-meta">
        <span>{recording.category ?? t('common.uncategorized')}</span>
        <span>
          {recording.segments.length} {t('common.units.segments')}
        </span>
      </div>
      <ClassificationBadge
        templateId={recording.templateId}
        confidence={recording.classificationConfidence}
      />
    </button>
  )
}
