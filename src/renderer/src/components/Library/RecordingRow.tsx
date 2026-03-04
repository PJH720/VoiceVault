import type { Recording } from '../../../../shared/types'

type RecordingRowProps = {
  recording: Recording
  selected: boolean
  onClick: () => void
}

export function RecordingRow({
  recording,
  selected,
  onClick
}: RecordingRowProps): React.JSX.Element {
  return (
    <button className={`recording-row ${selected ? 'selected' : ''}`} onClick={onClick}>
      <div className="recording-title">{recording.title}</div>
      <div className="recording-meta">
        <span>{new Date(recording.createdAt).toLocaleString()}</span>
        <span>{recording.duration.toFixed(1)}s</span>
      </div>
    </button>
  )
}
