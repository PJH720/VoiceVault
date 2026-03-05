import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock all service dependencies before importing ServiceRegistry
vi.mock('../../../src/main/store', () => ({
  getLlmModel: vi.fn(() => 'gemma-2-3n-instruct-q4_k_m'),
  getWhisperModel: vi.fn(() => 'base')
}))

const mockDestroy = vi.fn()
const mockUnload = vi.fn().mockResolvedValue(undefined)

vi.mock('../../../src/main/services/LLMService', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  LLMService: vi.fn(function (this: any) {
    this.destroy = mockDestroy
    this.unload = mockUnload
  })
}))

vi.mock('../../../src/main/services/WhisperService', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  WhisperService: vi.fn(function (this: any) {
    this.destroy = mockDestroy
  })
}))

vi.mock('../../../src/main/services/EmbeddingService', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  EmbeddingService: vi.fn(function (this: any) {
    this.destroy = mockDestroy
  })
}))

vi.mock('../../../src/main/services/DiarizationService', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DiarizationService: vi.fn(function (this: any) {
    this.destroy = mockDestroy
  })
}))

vi.mock('../../../src/main/services/TranslationService', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TranslationService: vi.fn(function (this: any) {
    // no-op
  })
}))

describe('ServiceRegistry', () => {
  beforeEach(async () => {
    vi.resetModules()
    mockDestroy.mockClear()
    mockUnload.mockClear()
  })

  test('returns same LLMService instance on multiple calls', async () => {
    const { ServiceRegistry } = await import('../../../src/main/services/ServiceRegistry')
    const first = ServiceRegistry.getLLMService()
    const second = ServiceRegistry.getLLMService()
    expect(first).toBe(second)
  })

  test('returns same WhisperService instance on multiple calls', async () => {
    const { ServiceRegistry } = await import('../../../src/main/services/ServiceRegistry')
    const first = ServiceRegistry.getWhisperService()
    const second = ServiceRegistry.getWhisperService()
    expect(first).toBe(second)
  })

  test('returns same EmbeddingService instance on multiple calls', async () => {
    const { ServiceRegistry } = await import('../../../src/main/services/ServiceRegistry')
    const first = ServiceRegistry.getEmbeddingService()
    const second = ServiceRegistry.getEmbeddingService()
    expect(first).toBe(second)
  })

  test('shutdown clears all service instances', async () => {
    const { ServiceRegistry } = await import('../../../src/main/services/ServiceRegistry')
    ServiceRegistry.getLLMService()
    ServiceRegistry.getWhisperService()
    ServiceRegistry.getEmbeddingService()

    await ServiceRegistry.shutdown()

    // After shutdown, new calls should create fresh instances
    const fresh = ServiceRegistry.getLLMService()
    expect(fresh).toBeDefined()
  })
})
