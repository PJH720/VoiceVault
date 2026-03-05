import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RecordingWithTranscript } from '../../../../shared/types'
import { useAudioPlayer } from '../../hooks/useAudioPlayer'
import { ExportDialog } from '../Export/ExportDialog'
import { SegmentRow } from '../Transcript/SegmentRow'

type RecordingDetailProps = {
  recording: RecordingWithTranscript | null
  onDelete: (id: number) => Promise<void>
}

export function RecordingDetail({ recording, onDelete }: RecordingDetailProps): React.JSX.Element {
  const { t } = useTranslation()
  const player = useAudioPlayer()
  const [isExportOpen, setIsExportOpen] = useState(false)
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
    }
  }, [player, recording])

  if (!recording) {
    return <div className="panel">{t('library.selectRecording')}</div>
  }

  return (
    <div className="panel">
      <h3>{recording.title}</h3>
      <p className="muted">{recording.audioPath}</p>

      <div className="playback-controls">
        <button onClick={() => (player.isPlaying ? player.pause() : void player.play())}>
          {player.isPlaying ? t('library.pause') : t('library.play')}
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
        <label htmlFor="rate">{t('library.speed')}</label>
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
          {t('library.delete')}
        </button>
        <button onClick={() => setIsExportOpen(true)}>{t('library.export')}</button>
      </div>

      <div className="transcript-list transcript-list-compact">
        {recording.segments.map((segment, index) => (
          <SegmentRow
            key={`${recording.id}-${segment.start}-${segment.end}-${index}`}
            segment={segment}
            onSeek={(seconds) => player.seek(seconds)}
          />
        ))}
        {recording.segments.length === 0 ? (
          <p className="muted">{t('library.noTranscriptSegments')}</p>
        ) : null}
      </div>
      <ExportDialog
        open={isExportOpen}
        recordingId={recording.id}
        onClose={() => setIsExportOpen(false)}
      />
    </div>
  )
}
