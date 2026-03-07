import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  SpeakerProfile,
  SpeakerSegment,
  SpeakerStats,
  TranscriptSegment
} from '../../../shared/types'

type UseDiarizationState = {
  speakerSegments: SpeakerSegment[]
  speakerProfiles: SpeakerProfile[]
  alignedSegments: Array<TranscriptSegment & { speaker: string }>
  stats: SpeakerStats[]
  isProcessing: boolean
  errorMessage: string | null
  processDiarization: (
    recordingId: number,
    audioPath: string,
    transcriptSegments: TranscriptSegment[]
  ) => Promise<void>
  refreshProfiles: () => Promise<void>
  createProfile: (name: string) => Promise<void>
  updateProfile: (id: number, updates: { name?: string; color?: string }) => Promise<void>
  mergeProfiles: (sourceId: number, targetId: number) => Promise<void>
}

function computeStats(segments: SpeakerSegment[]): SpeakerStats[] {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.end - segment.start), 0)
  const map = new Map<string, { duration: number; turns: number }>()
  for (const segment of segments) {
    const value = map.get(segment.speaker) ?? { duration: 0, turns: 0 }
    value.duration += Math.max(0, segment.end - segment.start)
    value.turns += 1
    map.set(segment.speaker, value)
  }
  return Array.from(map.entries()).map(([speaker, info]) => ({
    speaker,
    totalDuration: info.duration,
    percentage: total > 0 ? (info.duration / total) * 100 : 0,
    turnCount: info.turns
  }))
}

export function useDiarization(): UseDiarizationState {
  const [speakerSegments, setSpeakerSegments] = useState<SpeakerSegment[]>([])
  const [speakerProfiles, setSpeakerProfiles] = useState<SpeakerProfile[]>([])
  const [alignedSegments, setAlignedSegments] = useState<
    Array<TranscriptSegment & { speaker: string }>
  >([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const refreshProfiles = useCallback(async (): Promise<void> => {
    const profiles = await window.api.diarization.listSpeakers()
    setSpeakerProfiles(profiles)
  }, [])

  const processDiarization = useCallback(
    async (
      recordingId: number,
      audioPath: string,
      transcriptSegments: TranscriptSegment[]
    ): Promise<void> => {
      setErrorMessage(null)
      setIsProcessing(true)
      try {
        const result = await window.api.diarization.process(audioPath, recordingId)
        setSpeakerSegments(result.segments)
        const aligned = await window.api.diarization.alignTranscript(
          recordingId,
          transcriptSegments,
          result.segments
        )
        setAlignedSegments(aligned)
        await refreshProfiles()
      } catch (error) {
        setErrorMessage((error as Error).message)
      } finally {
        setIsProcessing(false)
      }
    },
    [refreshProfiles]
  )

  const createProfile = useCallback(
    async (name: string): Promise<void> => {
      await window.api.diarization.createSpeaker(name)
      await refreshProfiles()
    },
    [refreshProfiles]
  )

  const updateProfile = useCallback(
    async (id: number, updates: { name?: string; color?: string }): Promise<void> => {
      await window.api.diarization.updateSpeaker(id, updates)
      await refreshProfiles()
    },
    [refreshProfiles]
  )

  const mergeProfiles = useCallback(
    async (sourceId: number, targetId: number): Promise<void> => {
      await window.api.diarization.mergeSpeakers(sourceId, targetId)
      await refreshProfiles()
    },
    [refreshProfiles]
  )

  const stats = useMemo(() => computeStats(speakerSegments), [speakerSegments])

  useEffect(() => {
    void refreshProfiles()
  }, [refreshProfiles])

  return {
    speakerSegments,
    speakerProfiles,
    alignedSegments,
    stats,
    isProcessing,
    errorMessage,
    processDiarization,
    refreshProfiles,
    createProfile,
    updateProfile,
    mergeProfiles
  }
}
