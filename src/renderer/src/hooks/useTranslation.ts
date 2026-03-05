import { useCallback, useEffect, useState } from 'react'
import type {
  BatchTranslationItem,
  SupportedLanguage,
  TranslationProgress,
  TranslationResult
} from '../../../shared/types'

export function useTranslation(): {
  enabled: boolean
  targetLanguage: string
  languages: SupportedLanguage[]
  isTranslating: boolean
  progress: TranslationProgress
  toggleEnabled: () => void
  changeTargetLanguage: (language: string) => Promise<void>
  translateSegment: (
    text: string,
    sourceLanguage: string,
    segmentId?: number
  ) => Promise<TranslationResult>
  translateBatch: (
    items: BatchTranslationItem[],
    sourceLanguage: string
  ) => Promise<Array<{ id: number; result: TranslationResult }>>
} {
  const [enabled, setEnabled] = useState(false)
  const [targetLanguage, setTargetLanguage] = useState('en')
  const [languages, setLanguages] = useState<SupportedLanguage[]>([])
  const [isTranslating, setIsTranslating] = useState(false)
  const [progress, setProgress] = useState<TranslationProgress>({ current: 0, total: 0 })

  useEffect(() => {
    let mounted = true
    void window.api.translation.getLanguages().then((result) => {
      if (!mounted) return
      setLanguages(result.languages)
    })
    void window.api.translation.getTargetLanguage().then((result) => {
      if (!mounted) return
      setTargetLanguage(result.language)
    })
    const offProgress = window.api.translation.onProgress((value) => {
      if (!mounted) return
      setProgress(value)
    })
    return () => {
      mounted = false
      offProgress()
    }
  }, [])

  const toggleEnabled = useCallback(() => {
    setEnabled((prev) => !prev)
  }, [])

  const changeTargetLanguage = useCallback(async (language: string): Promise<void> => {
    const result = await window.api.translation.setTargetLanguage(language)
    setTargetLanguage(result.language)
  }, [])

  const translateSegment = useCallback(
    async (
      text: string,
      sourceLanguage: string,
      segmentId?: number
    ): Promise<TranslationResult> => {
      setIsTranslating(true)
      try {
        return await window.api.translation.translate(text, sourceLanguage, targetLanguage, segmentId)
      } finally {
        setIsTranslating(false)
      }
    },
    [targetLanguage]
  )

  const translateBatch = useCallback(
    async (
      items: BatchTranslationItem[],
      sourceLanguage: string
    ): Promise<Array<{ id: number; result: TranslationResult }>> => {
      setProgress({ current: 0, total: items.length })
      setIsTranslating(true)
      try {
        return await window.api.translation.batchTranslate(items, sourceLanguage, targetLanguage)
      } finally {
        setIsTranslating(false)
      }
    },
    [targetLanguage]
  )

  return {
    enabled,
    targetLanguage,
    languages,
    isTranslating,
    progress,
    toggleEnabled,
    changeTargetLanguage,
    translateSegment,
    translateBatch
  }
}
