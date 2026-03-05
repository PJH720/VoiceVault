import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TranscriptSegment, WhisperModelSize } from '../../../shared/types'

type UseTranscriptionState = {
  isTranscribing: boolean
  segments: TranscriptSegment[]
  language: string
  modelSize: WhisperModelSize
  modelAvailable: boolean
  downloadProgress: number
  errorMessage: string | null
  startTranscription: () => Promise<void>
  stopTranscription: () => Promise<void>
  clearSegments: () => void
  saveSegments: (recordingId: number) => Promise<number>
  loadSegments: (recordingId: number) => Promise<void>
  downloadModel: (modelSize: WhisperModelSize) => Promise<void>
  switchModel: (modelSize: WhisperModelSize) => Promise<void>
  refreshModelStatus: (modelSize?: WhisperModelSize) => Promise<void>
}

export function useTranscription(): UseTranscriptionState {
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [language, setLanguage] = useState('auto')
  const [modelSize, setModelSize] = useState<WhisperModelSize>('base')
  const [modelAvailable, setModelAvailable] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    void window.api.getWhisperModel().then((stored) => {
      if (!mounted) return
      setModelSize(stored)
      void window.api.transcription.checkModel(stored).then((status) => {
        if (!mounted) return
        setModelAvailable(status.available)
      })
    })

    const stopSegmentListener = window.api.transcription.onSegment((segment) => {
      setSegments((prev) => [...prev, segment])
      setLanguage(segment.language || 'auto')
    })
    const stopProgressListener = window.api.transcription.onDownloadProgress((payload) => {
      if (payload.modelSize !== modelSize) return
      setDownloadProgress(payload.percent)
      if (payload.percent >= 100) setModelAvailable(true)
    })

    return () => {
      mounted = false
      stopSegmentListener()
      stopProgressListener()
    }
  }, [modelSize])

  const refreshModelStatus = useCallback(async (requested?: WhisperModelSize): Promise<void> => {
    const target = requested ?? modelSize
    const status = await window.api.transcription.checkModel(target)
    setModelAvailable(status.available)
  }, [modelSize])

  const startTranscription = useCallback(async (): Promise<void> => {
    setErrorMessage(null)
    setSegments([])
    setLanguage('auto')
    await window.api.transcription.start()
    setIsTranscribing(true)
  }, [])

  const stopTranscription = useCallback(async (): Promise<void> => {
    await window.api.transcription.stop()
    setIsTranscribing(false)
  }, [])

  const clearSegments = useCallback((): void => {
    setSegments([])
    setLanguage('auto')
  }, [])

  const saveSegments = useCallback(
    async (recordingId: number): Promise<number> => {
      const result = await window.api.transcription.saveSegments(recordingId, segments)
      return result.inserted
    },
    [segments]
  )

  const loadSegments = useCallback(async (recordingId: number): Promise<void> => {
    const list = await window.api.transcription.listSegments(recordingId)
    setSegments(list)
    setLanguage(list[0]?.language ?? 'auto')
  }, [])

  const downloadModel = useCallback(async (nextModel: WhisperModelSize): Promise<void> => {
    setErrorMessage(null)
    setDownloadProgress(0)
    try {
      await window.api.transcription.downloadModel(nextModel)
      setDownloadProgress(100)
      setModelAvailable(true)
    } catch (error) {
      setErrorMessage((error as Error).message)
      throw error
    }
  }, [])

  const switchModel = useCallback(async (nextModel: WhisperModelSize): Promise<void> => {
    setModelSize(nextModel)
    await window.api.setWhisperModel(nextModel)
    await refreshModelStatus(nextModel)
  }, [refreshModelStatus])

  return useMemo(
    () => ({
      isTranscribing,
      segments,
      language,
      modelSize,
      modelAvailable,
      downloadProgress,
      errorMessage,
      startTranscription,
      stopTranscription,
      clearSegments,
      saveSegments,
      loadSegments,
      downloadModel,
      switchModel,
      refreshModelStatus
    }),
    [
      clearSegments,
      downloadModel,
      downloadProgress,
      errorMessage,
      isTranscribing,
      language,
      loadSegments,
      modelAvailable,
      modelSize,
      refreshModelStatus,
      saveSegments,
      segments,
      startTranscription,
      stopTranscription,
      switchModel
    ]
  )
}
