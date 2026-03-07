/** @vitest-environment jsdom */

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useLocale } from '../../../src/renderer/src/hooks/useLocale'

const changeLanguage = vi.fn(async () => undefined)

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: {
      language: 'en-US',
      changeLanguage
    }
  })
}))

declare global {
  interface Window {
    api: {
      setLocale: (locale: 'ko' | 'en' | 'ja') => Promise<'ko' | 'en' | 'ja'>
    }
  }
}

describe('useLocale hook', () => {
  it('changes language and persists locale', async () => {
    const setLocale = vi.fn(async (locale: 'ko' | 'en' | 'ja') => locale)
    window.api = { setLocale }

    const { result } = renderHook(() => useLocale())
    expect(result.current.locale).toBe('en')

    await act(async () => {
      await result.current.setLocale('ko')
    })

    expect(changeLanguage).toHaveBeenCalledWith('ko')
    expect(setLocale).toHaveBeenCalledWith('ko')
    expect(document.documentElement.lang).toBe('ko')
  })
})
