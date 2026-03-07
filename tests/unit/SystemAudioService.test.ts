import { afterEach, describe, expect, it, vi } from 'vitest'
import { SystemAudioService } from '../../src/main/services/SystemAudioService'

function mockPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true
  })
}

describe('SystemAudioService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns fallback sources when native listing unavailable', async () => {
    mockPlatform('darwin')
    const service = new SystemAudioService()
    const sources = await service.listSources()
    expect(sources.length).toBeGreaterThan(0)
    expect(sources.some((item) => item.type === 'input')).toBe(true)
    expect(sources.some((item) => item.type !== 'input')).toBe(true)
  })

  it('throws TODO error on linux capture', async () => {
    mockPlatform('linux')
    const service = new SystemAudioService()
    await expect(
      service.startCapture({
        mixMode: 'system-only',
        micVolume: 1,
        systemVolume: 1
      })
    ).rejects.toThrow('Linux system audio not yet implemented')
  })

  it('provides async stream on macOS fallback', async () => {
    mockPlatform('darwin')
    const service = new SystemAudioService()
    const stream = await service.startCapture({
      mixMode: 'both',
      micSource: 'default-mic',
      systemSource: 'default-system',
      micVolume: 0.8,
      systemVolume: 0.6
    })
    const first = await stream.next()
    expect(first.done).toBe(false)
    expect(first.value).toBeInstanceOf(Float32Array)
    await service.stopCapture()
  })
})
