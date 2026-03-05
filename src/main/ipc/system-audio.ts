import { ipcMain } from 'electron'
import { SystemAudioChannels } from '../../shared/ipc-channels'
import type { CaptureConfig } from '../../shared/types'
import { PermissionService } from '../services/PermissionService'
import { SystemAudioService } from '../services/SystemAudioService'

const systemAudioService = new SystemAudioService()

export function registerSystemAudioHandlers(): void {
  ipcMain.handle(SystemAudioChannels.LIST_SOURCES, async () => {
    const sources = await systemAudioService.listSources()
    return { sources }
  })

  ipcMain.handle(SystemAudioChannels.START_CAPTURE, async (_event, config: CaptureConfig) => {
    if (config == null || typeof config !== 'object') {
      throw new Error('Capture config must be an object')
    }
    const VALID_MIX_MODES = ['mic-only', 'system-only', 'both']
    if (!VALID_MIX_MODES.includes(config.mixMode)) {
      throw new Error(`Invalid mixMode "${config.mixMode}"`)
    }
    if (typeof config.micVolume !== 'number' || config.micVolume < 0 || config.micVolume > 1) {
      throw new Error('micVolume must be a number between 0 and 1')
    }
    if (
      typeof config.systemVolume !== 'number' ||
      config.systemVolume < 0 ||
      config.systemVolume > 1
    ) {
      throw new Error('systemVolume must be a number between 0 and 1')
    }
    await systemAudioService.startCapture(config)
    return { success: true }
  })

  ipcMain.handle(SystemAudioChannels.STOP_CAPTURE, async () => {
    await systemAudioService.stopCapture()
    return { success: true }
  })

  ipcMain.handle(SystemAudioChannels.CHECK_PERMISSIONS, async () => PermissionService.getStatus())

  ipcMain.handle(
    SystemAudioChannels.REQUEST_PERMISSIONS,
    async (_event, type: 'screen' | 'microphone') => {
      if (type !== 'screen' && type !== 'microphone') {
        throw new Error('Permission type must be "screen" or "microphone"')
      }
      if (type === 'screen') {
        await PermissionService.requestScreenRecording()
      } else {
        await PermissionService.requestMicrophonePermission()
      }
      return { success: true, permissions: PermissionService.getStatus() }
    }
  )
}
