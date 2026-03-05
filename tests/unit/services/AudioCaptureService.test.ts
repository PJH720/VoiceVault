import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock native module to simulate failure
vi.mock(
  /* @vite-ignore */ 'native-audio-node',
  () => {
    throw new Error('Module not found')
  }
)

describe('AudioCaptureService', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  test('enters fallback mode when native module is unavailable', async () => {
    const { AudioCaptureService } = await import(
      '../../../src/main/services/AudioCaptureService'
    )
    const service = new AudioCaptureService()
    expect(service.getCaptureMode()).toBe('fallback')
  })

  test('exposes getCaptureMode method', async () => {
    const { AudioCaptureService } = await import(
      '../../../src/main/services/AudioCaptureService'
    )
    const service = new AudioCaptureService()
    const mode = service.getCaptureMode()
    expect(['none', 'native', 'fallback']).toContain(mode)
  })
})
