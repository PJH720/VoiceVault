/** @vitest-environment jsdom */

import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BilingualTranscript } from '../../../src/renderer/src/components/Translation/BilingualTranscript'

const hookState = {
  enabled: false,
  targetLanguage: 'ko',
  languages: [{ code: 'ko', name: 'Korean' }],
  isTranslating: false,
  progress: { current: 0, total: 0 },
  toggleEnabled: vi.fn(),
  changeTargetLanguage: vi.fn(async () => undefined),
  translateBatch: vi.fn(async () => [])
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}))

vi.mock('../../../src/renderer/src/hooks/useTranslation', () => ({
  useTranslation: () => hookState
}))

describe('BilingualTranscript', () => {
  void React

  it('shows empty state when translation disabled', () => {
    act(() => {
      hookState.enabled = false
    })
    render(
      <BilingualTranscript
        segments={[{ id: 1, text: 'hello', language: 'en', start: 0, end: 1, confidence: 1 }]}
      />
    )
    expect(screen.getByText('translation.empty')).toBeTruthy()
  })

  it('toggles translation when header button clicked', async () => {
    hookState.enabled = true
    render(
      <BilingualTranscript
        segments={[{ id: 1, text: 'hello', language: 'en', start: 0, end: 1, confidence: 1 }]}
      />
    )
    // Wait for async translateBatch promise to resolve
    await waitFor(() => {
      expect(screen.getByText('translation.off')).toBeTruthy()
    })
    act(() => {
      fireEvent.click(screen.getByText('translation.off'))
    })
    expect(hookState.toggleEnabled).toHaveBeenCalledTimes(1)
  })
})
