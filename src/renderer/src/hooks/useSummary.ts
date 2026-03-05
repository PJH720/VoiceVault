import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CloudModelName,
  LlmModelName,
  RecordingSummaryRow,
  SummaryOutput,
  UsageStats
} from '../../../shared/types'

type UseSummaryState = {
  summary: SummaryOutput | null
  streamingText: string
  isGenerating: boolean
  llmModel: LlmModelName
  provider: 'local' | 'cloud'
  cloudModel: CloudModelName
  localOnlyMode: boolean
  usageStats: UsageStats
  modelAvailable: boolean
  downloadProgress: number
  estimatedCost: { inputTokens: number; outputTokens: number; cost: number } | null
  errorMessage: string | null
  generateSummary: (
    transcript: string,
    mode?: 'incremental' | 'final',
    previousSummary?: string
  ) => Promise<SummaryOutput | null>
  stopGeneration: () => Promise<void>
  estimateCloudCost: (transcript: string) => Promise<void>
  downloadModel: (model: LlmModelName) => Promise<void>
  switchModel: (model: LlmModelName) => Promise<void>
  switchProvider: (provider: 'local' | 'cloud') => Promise<void>
  switchCloudModel: (model: CloudModelName) => Promise<void>
  setApiKey: (key: string) => Promise<void>
  getMaskedApiKey: () => Promise<string | null>
  setLocalOnlyMode: (enabled: boolean) => Promise<void>
  resetUsageStats: () => Promise<void>
  refreshModelStatus: (model?: LlmModelName) => Promise<void>
  saveSummary: (recordingId: number, output: SummaryOutput) => Promise<number>
  loadLatestSummary: (recordingId: number) => Promise<RecordingSummaryRow | null>
}

export function useSummary(): UseSummaryState {
  const [summary, setSummary] = useState<SummaryOutput | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [llmModel, setLlmModelState] = useState<LlmModelName>('gemma-2-3n-instruct-q4_k_m')
  const [provider, setProvider] = useState<'local' | 'cloud'>('local')
  const [cloudModel, setCloudModel] = useState<CloudModelName>('claude-3-5-sonnet-20241022')
  const [localOnlyMode, setLocalOnlyModeState] = useState(false)
  const [usageStats, setUsageStats] = useState<UsageStats>({
    totalCost: 0,
    totalRequests: 0,
    lastReset: new Date().toISOString()
  })
  const [modelAvailable, setModelAvailable] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [estimatedCost, setEstimatedCost] = useState<{
    inputTokens: number
    outputTokens: number
    cost: number
  } | null>(null)
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
    void window.api.cloudLLM.getProvider().then((result) => {
      if (!mounted) return
      setProvider(result.provider)
    })
    void window.api.cloudLLM.getModel().then((result) => {
      if (!mounted) return
      setCloudModel(result.model)
    })
    void window.api.cloudLLM.getLocalOnly().then((result) => {
      if (!mounted) return
      setLocalOnlyModeState(result.enabled)
    })
    void window.api.cloudLLM.getUsageStats().then((result) => {
      if (!mounted) return
      setUsageStats(result)
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
    const stopCloudToken = window.api.cloudLLM.onToken((token) => {
      setStreamingText((prev) => prev + token)
    })
    const stopCloudComplete = window.api.cloudLLM.onComplete((output) => {
      setSummary(output)
      setStreamingText('')
      setIsGenerating(false)
    })

    return () => {
      mounted = false
      stopToken()
      stopComplete()
      stopProgress()
      stopCloudToken()
      stopCloudComplete()
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
      try {
        if (provider === 'cloud' && !localOnlyMode) {
          try {
            const cloud = await window.api.cloudLLM.summarize(transcript, cloudModel)
            setIsGenerating(false)
            setSummary(cloud.output)
            setUsageStats(await window.api.cloudLLM.getUsageStats())
            return cloud.output
          } catch {
            // fallback to local model
          }
        }
        const response = await window.api.llm.summarize(transcript, mode, previousSummary)
        setIsGenerating(false)
        if (response.cancelled) return null
        if (response.output) {
          setSummary(response.output)
        }
        return response.output
      } catch (error) {
        setIsGenerating(false)
        setErrorMessage((error as Error).message)
        return null
      }
    },
    [cloudModel, localOnlyMode, provider]
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

  const switchProvider = useCallback(async (nextProvider: 'local' | 'cloud'): Promise<void> => {
    const result = await window.api.cloudLLM.setProvider(nextProvider)
    setProvider(result.provider)
  }, [])

  const switchCloudModel = useCallback(async (model: CloudModelName): Promise<void> => {
    const result = await window.api.cloudLLM.setModel(model)
    setCloudModel(result.model)
  }, [])

  const setApiKey = useCallback(async (key: string): Promise<void> => {
    await window.api.cloudLLM.setApiKey(key)
  }, [])

  const getMaskedApiKey = useCallback(async (): Promise<string | null> => {
    const result = await window.api.cloudLLM.getApiKey()
    return result.key
  }, [])

  const estimateCloudCost = useCallback(async (transcript: string): Promise<void> => {
    if (!transcript.trim()) {
      setEstimatedCost(null)
      return
    }
    const estimate = await window.api.cloudLLM.estimateCost(transcript, cloudModel)
    setEstimatedCost(estimate)
  }, [cloudModel])

  const setLocalOnlyMode = useCallback(async (enabled: boolean): Promise<void> => {
    const result = await window.api.cloudLLM.setLocalOnly(enabled)
    setLocalOnlyModeState(result.enabled)
  }, [])

  const resetUsageStats = useCallback(async (): Promise<void> => {
    const next = await window.api.cloudLLM.resetStats()
    setUsageStats(next)
  }, [])

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
      provider,
      cloudModel,
      localOnlyMode,
      usageStats,
      modelAvailable,
      downloadProgress,
      estimatedCost,
      errorMessage,
      generateSummary,
      stopGeneration,
      estimateCloudCost,
      downloadModel,
      switchModel,
      switchProvider,
      switchCloudModel,
      setApiKey,
      getMaskedApiKey,
      setLocalOnlyMode,
      resetUsageStats,
      refreshModelStatus,
      saveSummary,
      loadLatestSummary
    }),
    [
      downloadModel,
      downloadProgress,
      errorMessage,
      estimatedCost,
      cloudModel,
      generateSummary,
      isGenerating,
      llmModel,
      localOnlyMode,
      loadLatestSummary,
      modelAvailable,
      provider,
      refreshModelStatus,
      resetUsageStats,
      saveSummary,
      setApiKey,
      getMaskedApiKey,
      setLocalOnlyMode,
      stopGeneration,
      streamingText,
      summary,
      switchCloudModel,
      switchModel,
      switchProvider,
      usageStats,
      estimateCloudCost
    ]
  )
}
