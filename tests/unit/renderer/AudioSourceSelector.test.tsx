/** @vitest-environment jsdom */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AudioSourceSelector } from '../../../src/renderer/src/components/Audio/AudioSourceSelector'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (options) {
        return `${key}:${JSON.stringify(options)}`
      }
      return key
    }
  })
}))

declare global {
  interface Window {
    api: {
      systemAudio: {
        listSources: () => Promise<{
          sources: Array<{ id: string; name: string; type: 'input' | 'output' | 'app'; isDefault: boolean }>
        }>
        checkPermissions: () => Promise<{ screenRecording: boolean; microphone: boolean }>
        requestPermissions: (
          type: 'screen' | 'microphone'
        ) => Promise<{ success: boolean; permissions: { screenRecording: boolean; microphone: boolean } }>
        startCapture: (config: unknown) => Promise<{ success: boolean }>
        stopCapture: () => Promise<{ success: boolean }>
      }
    }
  }
}

describe('AudioSourceSelector', () => {
  void React

  it('loads sources and starts capture', async () => {
    const startCapture = vi.fn(async () => ({ success: true }))
    window.api = {
      systemAudio: {
        listSources: vi.fn(async () => ({
          sources: [
            { id: 'mic-1', name: 'Default Mic', type: 'input', isDefault: true },
            { id: 'sys-1', name: 'System Output', type: 'output', isDefault: true }
          ]
        })),
        checkPermissions: vi.fn(async () => ({ screenRecording: true, microphone: true })),
        requestPermissions: vi.fn(async () => ({
          success: true,
          permissions: { screenRecording: true, microphone: true }
        })),
        startCapture,
        stopCapture: vi.fn(async () => ({ success: true }))
      }
    }

    render(<AudioSourceSelector />)

    await waitFor(() => {
      expect(window.api.systemAudio.listSources).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByText('audio.start'))
    await waitFor(() => {
      expect(startCapture).toHaveBeenCalledTimes(1)
    })
  })
})
