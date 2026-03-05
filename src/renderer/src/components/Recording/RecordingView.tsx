import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useRecordingContext } from '../../hooks/useRecordingContext'
import { useDiarization } from '../../hooks/useDiarization'
import { useSummary } from '../../hooks/useSummary'
import { useTranscription } from '../../hooks/useTranscription'
import { SpeakerProfileManager } from '../Diarization/SpeakerProfileManager'
import { SpeakerStats } from '../Diarization/SpeakerStats'
import { SpeakerTimeline } from '../Diarization/SpeakerTimeline'
import { SummaryView } from '../Summary/SummaryView'
import { BilingualTranscript } from '../Translation/BilingualTranscript'
import { SpeakerTranscriptView } from '../Transcript/SpeakerTranscriptView'
import { TranscriptView } from '../Transcript/TranscriptView'
import { Waveform } from '../ui/Waveform'

function toClock(ms: number): string {
  const total = Math.floor(ms / 1000)
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export function RecordingView(): React.JSX.Element {
  const { t } = useTranslation()
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
  const diarization = useDiarization()
  const lastSummaryRef = useRef('')

  useEffect(() => {
    if (!summary.summary?.summary) return
    lastSummaryRef.current = summary.summary.summary
  }, [summary.summary])

  useEffect(() => {
    if (!isRecording) return
    const timer = setInterval(() => {
      const transcript = transcription.segments
        .map((segment) => segment.text)
        .join(' ')
        .trim()
      if (!transcript) return
      const wordCount = transcript.split(/\s+/).filter(Boolean).length
      if (wordCount < 100) return
      void summary.estimateCloudCost(transcript)
      void summary.generateSummary(transcript, 'incremental', lastSummaryRef.current)
    }, 60000)
    return () => clearInterval(timer)
  }, [isRecording, summary, transcription.segments])

  const onRecordToggle = async (): Promise<void> => {
    if (isRecording) {
      const result = await stopRecording()
      await transcription.stopTranscription()
      const finalTranscript = transcription.segments
        .map((segment) => segment.text)
        .join(' ')
        .trim()
      if (finalTranscript.length > 0) {
        await summary.estimateCloudCost(finalTranscript)
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
        if (finalTranscript.length > 0) {
          try {
            const classification = await window.api.classification.autoClassify(finalTranscript)
            await window.api.classification.applyTemplate(result.id, classification.templateId)
          } catch {
            // Classification is optional; keep recording flow resilient.
          }
        }
        await diarization.processDiarization(result.id, result.audioPath, transcription.segments)
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
          {isRecording ? t('recording.stop') : t('recording.start')}
        </button>
        <div className="timer">{toClock(durationMs)}</div>
      </div>

      <Waveform levels={levels} isRecording={isRecording} />

      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
      {transcription.errorMessage ? (
        <p className="error-text">{transcription.errorMessage}</p>
      ) : null}
      {diarization.errorMessage ? <p className="error-text">{diarization.errorMessage}</p> : null}
      {lastResult ? (
        <p className="muted">
          {t('recording.lastSaved', {
            path: lastResult.audioPath,
            duration: lastResult.duration.toFixed(1)
          })}
        </p>
      ) : null}

      <TranscriptView language={transcription.language} segments={transcription.segments} />
      <BilingualTranscript segments={transcription.segments} />
      <SpeakerTranscriptView segments={diarization.alignedSegments} />
      <SpeakerTimeline segments={diarization.speakerSegments} duration={durationMs / 1000} />
      <SpeakerStats stats={diarization.stats} />
      <SpeakerProfileManager
        profiles={diarization.speakerProfiles}
        onCreate={diarization.createProfile}
        onUpdate={diarization.updateProfile}
        onMerge={diarization.mergeProfiles}
      />
      <SummaryView
        summary={summary.summary}
        streamingText={summary.streamingText}
        isGenerating={summary.isGenerating}
        estimatedCost={summary.estimatedCost}
      />
    </div>
  )
}
