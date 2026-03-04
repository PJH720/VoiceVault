import { useEffect, useState } from 'react'
import type { RecordingWithTranscript, TranscriptSegment } from '../../../../shared/types'
import { useAudioPlayer } from '../../hooks/useAudioPlayer'
import { SegmentRow } from '../Transcript/SegmentRow'

type RecordingDetailProps = {
  recording: RecordingWithTranscript | null
  onDelete: (id: number) => Promise<void>
}

export function RecordingDetail({ recording, onDelete }: RecordingDetailProps): React.JSX.Element {
  const player = useAudioPlayer()
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const formatTime = (value: number): string => {
    const safe = Number.isFinite(value) && value >= 0 ? value : 0
    const total = Math.floor(safe)
    const mm = String(Math.floor(total / 60)).padStart(2, '0')
    const ss = String(total % 60).padStart(2, '0')
    return `${mm}:${ss}`
  }

  useEffect(() => {
    if (recording) {
      player.load(recording.audioPath)
      setSegments(recording.segments)
    }
  }, [player, recording])

  if (!recording) {
    return <div className="panel">Select a recording.</div>
  }

  return (
    <div className="panel">
      <h3>{recording.title}</h3>
      <p className="muted">{recording.audioPath}</p>

      <div className="playback-controls">
        <button onClick={() => (player.isPlaying ? player.pause() : void player.play())}>
          {player.isPlaying ? 'Pause' : 'Play'}
        </button>
        <span className="muted">
          {formatTime(player.currentTime)} / {formatTime(player.duration)}
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(0, player.duration)}
          step={0.1}
          value={Math.min(player.currentTime, Math.max(0, player.duration))}
          onChange={(event) => player.seek(Number(event.target.value))}
        />
      </div>

      <div className="playback-controls">
        <label htmlFor="rate">Speed</label>
        <select
          id="rate"
          value={player.playbackRate}
          onChange={(event) => player.setRate(Number(event.target.value))}
        >
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={1.5}>1.5x</option>
          <option value={2}>2x</option>
        </select>
        <button className="danger" onClick={() => void onDelete(recording.id)}>
          Delete
        </button>
      </div>

      <div className="transcript-list transcript-list-compact">
        {segments.map((segment, index) => (
          <SegmentRow
            key={`${recording.id}-${segment.start}-${segment.end}-${index}`}
            segment={segment}
            onSeek={(seconds) => player.seek(seconds)}
          />
        ))}
        {segments.length === 0 ? <p className="muted">No transcript segments saved.</p> : null}
      </div>
    </div>
  )
}
