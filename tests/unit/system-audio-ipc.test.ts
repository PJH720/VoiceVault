import { describe, expect, it, vi } from 'vitest'
import { SystemAudioChannels } from '../../src/shared/ipc-channels'

const handlers = new Map<string, (...args: unknown[]) => unknown>()
const listSources = vi.fn(async () => [{ id: 'mic', name: 'Mic', type: 'input', isDefault: true }])
const startCapture = vi.fn(async () => undefined)
const stopCapture = vi.fn(async () => undefined)
const getStatus = vi.fn(() => ({ screenRecording: false, microphone: true }))
const requestScreenRecording = vi.fn(async () => undefined)
const requestMicrophonePermission = vi.fn(async () => true)

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    })
  }
}))

vi.mock('../../src/main/services/SystemAudioService', () => ({
  SystemAudioService: vi.fn(function SystemAudioServiceMock() {
    return {
      listSources,
      startCapture,
      stopCapture
    }
  })
}))

vi.mock('../../src/main/services/PermissionService', () => ({
  PermissionService: {
    getStatus,
    requestScreenRecording,
    requestMicrophonePermission
  }
}))

describe('registerSystemAudioHandlers', () => {
  it('registers handlers and proxies to services', async () => {
    const { registerSystemAudioHandlers } = await import('../../src/main/ipc/system-audio')
    registerSystemAudioHandlers()

    expect(handlers.has(SystemAudioChannels.LIST_SOURCES)).toBe(true)
    expect(handlers.has(SystemAudioChannels.START_CAPTURE)).toBe(true)
    expect(handlers.has(SystemAudioChannels.STOP_CAPTURE)).toBe(true)
    expect(handlers.has(SystemAudioChannels.CHECK_PERMISSIONS)).toBe(true)
    expect(handlers.has(SystemAudioChannels.REQUEST_PERMISSIONS)).toBe(true)

    const listHandler = handlers.get(SystemAudioChannels.LIST_SOURCES)!
    const listResult = (await listHandler()) as { sources: unknown[] }
    expect(listResult.sources).toHaveLength(1)
    expect(listSources).toHaveBeenCalledTimes(1)

    const startHandler = handlers.get(SystemAudioChannels.START_CAPTURE)!
    await startHandler({}, { mixMode: 'mic-only', micVolume: 1, systemVolume: 1 })
    expect(startCapture).toHaveBeenCalledTimes(1)

    const checkHandler = handlers.get(SystemAudioChannels.CHECK_PERMISSIONS)!
    expect(await checkHandler()).toEqual({ screenRecording: false, microphone: true })

    const requestHandler = handlers.get(SystemAudioChannels.REQUEST_PERMISSIONS)!
    await requestHandler({}, 'screen')
    expect(requestScreenRecording).toHaveBeenCalledTimes(1)
    await requestHandler({}, 'microphone')
    expect(requestMicrophonePermission).toHaveBeenCalledTimes(1)
  })
})
