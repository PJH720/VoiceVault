import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { TranscriptSegment } from '../../../../shared/types'
import { LanguageBadge } from './LanguageBadge'
import { SegmentRow } from './SegmentRow'

type TranscriptViewProps = {
  language: string
  segments: TranscriptSegment[]
  onSeek?: (seconds: number) => void
}

export function TranscriptView({
  language,
  segments,
  onSeek
}: TranscriptViewProps): React.JSX.Element {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth'
    })
  }, [segments])

  return (
    <div className="panel transcript-panel">
      <div className="transcript-header">
        <h3>{t('transcript.live')}</h3>
        <LanguageBadge language={language} />
      </div>
      <div className="transcript-list" ref={scrollRef}>
        {segments.map((segment, index) => (
          <SegmentRow
            key={`${segment.start}-${segment.end}-${index}`}
            segment={segment}
            onSeek={onSeek}
          />
        ))}
        {segments.length === 0 ? <p className="muted">{t('transcript.empty')}</p> : null}
      </div>
    </div>
  )
}
