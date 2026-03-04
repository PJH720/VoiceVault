import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LlmModelName, RecordingSummaryRow, SummaryOutput } from '../../../shared/types'

type UseSummaryState = {
  summary: SummaryOutput | null
  streamingText: string
  isGenerating: boolean
  llmModel: LlmModelName
  modelAvailable: boolean
  downloadProgress: number
  errorMessage: string | null
  generateSummary: (
    transcript: string,
    mode?: 'incremental' | 'final',
    previousSummary?: string
  ) => Promise<SummaryOutput | null>
  stopGeneration: () => Promise<void>
  downloadModel: (model: LlmModelName) => Promise<void>
  switchModel: (model: LlmModelName) => Promise<void>
  refreshModelStatus: (model?: LlmModelName) => Promise<void>
  saveSummary: (recordingId: number, output: SummaryOutput) => Promise<number>
  loadLatestSummary: (recordingId: number) => Promise<RecordingSummaryRow | null>
}

export function useSummary(): UseSummaryState {
  const [summary, setSummary] = useState<SummaryOutput | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [llmModel, setLlmModelState] = useState<LlmModelName>('gemma-2-3n-instruct-q4_k_m')
  const [modelAvailable, setModelAvailable] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    void window.api.getLlmModel().then((model) => {
      if (!mounted) return
      setLlmModelState(model)
      void window.api.llm.checkModel(model).then((status) => {
        if (!mounted) return
        setModelAvailable(status.available)
      })
    })

    const stopToken = window.api.llm.onToken((token) => {
      setStreamingText((prev) => prev + token)
    })
    const stopComplete = window.api.llm.onComplete((output) => {
      setSummary(output)
      setStreamingText('')
      setIsGenerating(false)
    })
    const stopProgress = window.api.llm.onDownloadProgress((progress) => {
      if (progress.modelName !== llmModel) return
      setDownloadProgress(progress.percent)
      if (progress.percent >= 100) setModelAvailable(true)
    })

    return () => {
      mounted = false
      stopToken()
      stopComplete()
      stopProgress()
    }
  }, [llmModel])

  const refreshModelStatus = useCallback(async (model?: LlmModelName): Promise<void> => {
    const target = model ?? llmModel
    const status = await window.api.llm.checkModel(target)
    setModelAvailable(status.available)
  }, [llmModel])

  const generateSummary = useCallback(
    async (
      transcript: string,
      mode: 'incremental' | 'final' = 'final',
      previousSummary = ''
    ): Promise<SummaryOutput | null> => {
      if (!transcript.trim()) return null
      setErrorMessage(null)
      setIsGenerating(true)
      setStreamingText('')
      const response = await window.api.llm.summarize(transcript, mode, previousSummary)
      setIsGenerating(false)
      if (response.cancelled) return null
      if (response.output) {
        setSummary(response.output)
      }
      return response.output
    },
    []
  )

  const stopGeneration = useCallback(async (): Promise<void> => {
    await window.api.llm.stop()
    setIsGenerating(false)
  }, [])

  const downloadModel = useCallback(async (model: LlmModelName): Promise<void> => {
    setErrorMessage(null)
    setDownloadProgress(0)
    try {
      await window.api.llm.downloadModel(model)
      setDownloadProgress(100)
      setModelAvailable(true)
    } catch (error) {
      setErrorMessage((error as Error).message)
      throw error
    }
  }, [])

  const switchModel = useCallback(async (model: LlmModelName): Promise<void> => {
    setLlmModelState(model)
    await window.api.setLlmModel(model)
    await refreshModelStatus(model)
  }, [refreshModelStatus])

  const saveSummary = useCallback(async (recordingId: number, output: SummaryOutput): Promise<number> => {
    const result = await window.api.llm.saveSummary(recordingId, output)
    return result.id
  }, [])

  const loadLatestSummary = useCallback(
    async (recordingId: number): Promise<RecordingSummaryRow | null> => {
      const result = await window.api.llm.getLatestSummary(recordingId)
      if (result) {
        setSummary(result.output)
      }
      return result
    },
    []
  )

  return useMemo(
    () => ({
      summary,
      streamingText,
      isGenerating,
      llmModel,
      modelAvailable,
      downloadProgress,
      errorMessage,
      generateSummary,
      stopGeneration,
      downloadModel,
      switchModel,
      refreshModelStatus,
      saveSummary,
      loadLatestSummary
    }),
    [
      downloadModel,
      downloadProgress,
      errorMessage,
      generateSummary,
      isGenerating,
      llmModel,
      loadLatestSummary,
      modelAvailable,
      refreshModelStatus,
      saveSummary,
      stopGeneration,
      streamingText,
      summary,
      switchModel
    ]
  )
}
