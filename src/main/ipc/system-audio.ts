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
      if (type === 'screen') {
        await PermissionService.requestScreenRecording()
      } else {
        await PermissionService.requestMicrophonePermission()
      }
      return { success: true, permissions: PermissionService.getStatus() }
    }
  )
}
