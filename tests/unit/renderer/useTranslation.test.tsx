/** @vitest-environment jsdom */

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTranslation } from '../../../src/renderer/src/hooks/useTranslation'

type ProgressHandler = (payload: { current: number; total: number }) => void

declare global {
  interface Window {
    api: {
      translation: {
        getLanguages: () => Promise<{ languages: Array<{ code: string; name: string }> }>
        getTargetLanguage: () => Promise<{ language: string }>
        setTargetLanguage: (language: string) => Promise<{ language: string }>
        translate: (
          text: string,
          sourceLanguage: string,
          targetLanguage: string,
          segmentId?: number
        ) => Promise<{ translatedText: string; confidence: number; model: string }>
        batchTranslate: (
          items: Array<{ id: number; text: string }>,
          sourceLanguage: string,
          targetLanguage: string
        ) => Promise<
          Array<{
            id: number
            result: { translatedText: string; confidence: number; model: string }
          }>
        >
        onProgress: (callback: ProgressHandler) => () => void
      }
    }
  }
}

describe('useTranslation hook', () => {
  let progressHandler: ProgressHandler | null = null

  beforeEach(() => {
    progressHandler = null
    window.api = {
      translation: {
        getLanguages: vi.fn(async () => ({ languages: [{ code: 'en', name: 'English' }] })),
        getTargetLanguage: vi.fn(async () => ({ language: 'en' })),
        setTargetLanguage: vi.fn(async (language: string) => ({ language })),
        translate: vi.fn(async () => ({
          translatedText: '안녕하세요',
          confidence: 0.9,
          model: 'local'
        })),
        batchTranslate: vi.fn(async () => [
          { id: 1, result: { translatedText: '안녕하세요', confidence: 0.9, model: 'local' } }
        ]),
        onProgress: vi.fn((callback: ProgressHandler) => {
          progressHandler = callback
          return () => {
            progressHandler = null
          }
        })
      }
    }
  })

  it('loads languages/target and updates progress + target language', async () => {
    const { result } = renderHook(() => useTranslation())

    await waitFor(() => {
      expect(result.current.languages).toHaveLength(1)
      expect(result.current.targetLanguage).toBe('en')
    })

    act(() => {
      progressHandler?.({ current: 1, total: 3 })
    })
    expect(result.current.progress).toEqual({ current: 1, total: 3 })

    await act(async () => {
      await result.current.changeTargetLanguage('ko')
    })
    expect(result.current.targetLanguage).toBe('ko')
  })
})
