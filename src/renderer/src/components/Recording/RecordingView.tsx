import { useEffect, useRef } from 'react'
import { useRecordingContext } from '../../hooks/useRecordingContext'
import { useSummary } from '../../hooks/useSummary'
import { useTranscription } from '../../hooks/useTranscription'
import { SummaryView } from '../Summary/SummaryView'
import { TranscriptView } from '../Transcript/TranscriptView'
import { Waveform } from '../ui/Waveform'

function toClock(ms: number): string {
  const total = Math.floor(ms / 1000)
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export function RecordingView(): React.JSX.Element {
  const {
    isRecording,
    durationMs,
    levels,
    errorMessage,
    lastResult,
    startRecording,
    stopRecording
  } = useRecordingContext()
  const transcription = useTranscription()
  const summary = useSummary()
  const lastSummaryRef = useRef('')

  useEffect(() => {
    if (!summary.summary?.summary) return
    lastSummaryRef.current = summary.summary.summary
  }, [summary.summary])

  useEffect(() => {
    if (!isRecording) return
    const timer = setInterval(() => {
      const transcript = transcription.segments.map((segment) => segment.text).join(' ').trim()
      if (!transcript) return
      const wordCount = transcript.split(/\s+/).filter(Boolean).length
      if (wordCount < 100) return
      void summary.generateSummary(transcript, 'incremental', lastSummaryRef.current)
    }, 60000)
    return () => clearInterval(timer)
  }, [isRecording, summary, transcription.segments])

  const onRecordToggle = async (): Promise<void> => {
    if (isRecording) {
      const result = await stopRecording()
      await transcription.stopTranscription()
      const finalTranscript = transcription.segments.map((segment) => segment.text).join(' ').trim()
      if (finalTranscript.length > 0) {
        const finalSummary = await summary.generateSummary(
          finalTranscript,
          'final',
          lastSummaryRef.current
        )
        if (result?.id && finalSummary) {
          await summary.saveSummary(result.id, finalSummary)
        }
      }
      if (result?.id) {
        await transcription.saveSegments(result.id)
      }
      return
    }
    if (!transcription.modelAvailable) {
      await transcription.downloadModel(transcription.modelSize)
      await transcription.refreshModelStatus(transcription.modelSize)
    }
    await startRecording()
    await transcription.startTranscription()
  }

  return (
    <div className="panel">
      <div className="recording-controls">
        <button className={`record-btn ${isRecording ? 'recording' : ''}`} onClick={onRecordToggle}>
          {isRecording ? 'Stop' : 'Record'}
        </button>
        <div className="timer">{toClock(durationMs)}</div>
      </div>

      <Waveform levels={levels} isRecording={isRecording} />

      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
      {transcription.errorMessage ? <p className="error-text">{transcription.errorMessage}</p> : null}
      {lastResult ? (
        <p className="muted">
          Last saved: {lastResult.audioPath} ({lastResult.duration.toFixed(1)}s)
        </p>
      ) : null}

      <TranscriptView language={transcription.language} segments={transcription.segments} />
      <SummaryView
        summary={summary.summary}
        streamingText={summary.streamingText}
        isGenerating={summary.isGenerating}
      />
    </div>
  )
}
