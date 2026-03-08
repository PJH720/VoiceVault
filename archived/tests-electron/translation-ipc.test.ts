import { describe, expect, it, vi } from 'vitest'
import { TranslationChannels } from '../../src/shared/ipc-channels'

const handlers = new Map<string, (...args: unknown[]) => unknown>()
const send = vi.fn()
const batchTranslate = vi.fn(
  async (
    _items: Array<{ id: number; text: string }>,
    _source: string,
    _target: string,
    onProgress: (
      current: number,
      total: number,
      result: { translatedText: string },
      id: number
    ) => void
  ) => {
    onProgress(1, 2, { translatedText: 'a' }, 11)
    onProgress(2, 2, { translatedText: 'b' }, 12)
    return new Map([
      [11, { translatedText: 'a', confidence: 0.9, model: 'm' }],
      [12, { translatedText: 'b', confidence: 0.9, model: 'm' }]
    ])
  }
)
const translate = vi.fn(async () => ({ translatedText: 'x', confidence: 0.9, model: 'm' }))
const getSupportedLanguages = vi.fn(() => [{ code: 'en', name: 'English' }])
const clearMemoryCache = vi.fn()
const setTranslationTargetLanguage = vi.fn((language: string) => language)
const getTranslationTargetLanguage = vi.fn(() => 'en')

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    })
  }
}))

const mockLlmService = {}

vi.mock('../../src/main/services/LLMService', () => ({
  LLMService: vi.fn(function LLMServiceMock() {
    return {}
  })
}))

vi.mock('../../src/main/services/ServiceRegistry', () => ({
  ServiceRegistry: {
    getLLMService: () => mockLlmService,
    getTranslationService: () => ({
      translate,
      batchTranslate,
      getSupportedLanguages,
      clearMemoryCache
    })
  }
}))

vi.mock('../../src/main/store', () => ({
  getLlmModel: vi.fn(() => 'gemma-2-3n-instruct-q4_k_m'),
  setTranslationTargetLanguage,
  getTranslationTargetLanguage
}))

describe('registerTranslationHandlers', () => {
  it('registers handlers and emits batch progress events', async () => {
    const { registerTranslationHandlers } = await import('../../src/main/ipc/translation')
    registerTranslationHandlers(
      { webContents: { send } } as never,
      { getConnection: () => ({}) } as never
    )

    const batchHandler = handlers.get(TranslationChannels.BATCH_TRANSLATE)!
    const result = (await batchHandler(
      {},
      [
        { id: 11, text: 'one' },
        { id: 12, text: 'two' }
      ],
      'en',
      'ko'
    )) as Array<{ id: number; result: { translatedText: string } }>

    expect(result).toHaveLength(2)
    expect(send).toHaveBeenCalledWith(TranslationChannels.ON_PROGRESS, { current: 1, total: 2 })
    expect(send).toHaveBeenCalledWith(TranslationChannels.ON_TRANSLATED, {
      id: 11,
      result: { translatedText: 'a' }
    })

    const setHandler = handlers.get(TranslationChannels.SET_TARGET_LANGUAGE)!
    const setResult = (await setHandler({}, 'ja')) as { language: string }
    expect(setResult.language).toBe('ja')
    expect(clearMemoryCache).toHaveBeenCalledTimes(1)
  })
})
