/** @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest'
import { SystemAudioChannels, TranslationChannels } from '../../src/shared/ipc-channels'

const exposeInMainWorld = vi.fn()
const invoke = vi.fn(async () => ({}))
const on = vi.fn()
const removeListener = vi.fn()

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld
  },
  ipcRenderer: {
    invoke,
    on,
    removeListener
  }
}))

vi.mock('@electron-toolkit/preload', () => ({
  electronAPI: { platform: 'test' }
}))

describe('preload api contract', () => {
  it('exposes api and routes system-audio/translation channels', async () => {
    Object.defineProperty(process, 'contextIsolated', {
      value: true,
      configurable: true
    })
    await import('../../src/preload/index')

    const apiCall = exposeInMainWorld.mock.calls.find((entry) => entry[0] === 'api')
    expect(apiCall).toBeTruthy()
    const api = apiCall?.[1] as {
      systemAudio: { startCapture: (config: unknown) => Promise<unknown> }
      translation: {
        batchTranslate: (items: unknown[], source: string, target: string) => Promise<unknown>
        onProgress: (callback: (payload: { current: number; total: number }) => void) => () => void
      }
    }

    await api.systemAudio.startCapture({ mixMode: 'mic-only', micVolume: 1, systemVolume: 1 })
    expect(invoke).toHaveBeenCalledWith(SystemAudioChannels.START_CAPTURE, {
      mixMode: 'mic-only',
      micVolume: 1,
      systemVolume: 1
    })

    await api.translation.batchTranslate([{ id: 1, text: 'x' }], 'en', 'ko')
    expect(invoke).toHaveBeenCalledWith(
      TranslationChannels.BATCH_TRANSLATE,
      [{ id: 1, text: 'x' }],
      'en',
      'ko'
    )

    const off = api.translation.onProgress(() => undefined)
    expect(on).toHaveBeenCalledWith(TranslationChannels.ON_PROGRESS, expect.any(Function))
    off()
    expect(removeListener).toHaveBeenCalledWith(
      TranslationChannels.ON_PROGRESS,
      expect.any(Function)
    )
  })
})
