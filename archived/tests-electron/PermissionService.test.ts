import { describe, expect, it, vi } from 'vitest'

const getMediaAccessStatus = vi.fn()
const askForMediaAccess = vi.fn()
const openExternal = vi.fn()

vi.mock('electron', () => ({
  systemPreferences: {
    getMediaAccessStatus,
    askForMediaAccess
  },
  shell: {
    openExternal
  }
}))

function mockPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true
  })
}

describe('PermissionService', () => {
  it('returns true on non-mac platforms', async () => {
    mockPlatform('linux')
    const { PermissionService } = await import('../../src/main/services/PermissionService')
    expect(PermissionService.checkScreenRecording()).toBe(true)
    expect(PermissionService.checkMicrophonePermission()).toBe(true)
    expect(await PermissionService.requestMicrophonePermission()).toBe(true)
  })

  it('checks and requests mac permissions', async () => {
    mockPlatform('darwin')
    getMediaAccessStatus.mockImplementation((type: string) =>
      type === 'screen' ? 'denied' : 'granted'
    )
    askForMediaAccess.mockResolvedValue(true)
    const { PermissionService } = await import('../../src/main/services/PermissionService')
    expect(PermissionService.checkScreenRecording()).toBe(false)
    expect(PermissionService.checkMicrophonePermission()).toBe(true)
    await PermissionService.requestScreenRecording()
    expect(openExternal).toHaveBeenCalled()
    expect(await PermissionService.requestMicrophonePermission()).toBe(true)
  })
})
