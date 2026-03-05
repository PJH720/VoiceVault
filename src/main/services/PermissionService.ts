import { shell, systemPreferences } from 'electron'
import type { AudioPermissionStatus } from '../../shared/types'

export class PermissionService {
  public static checkScreenRecording(): boolean {
    if (process.platform !== 'darwin') return true
    return systemPreferences.getMediaAccessStatus('screen') === 'granted'
  }

  public static checkMicrophonePermission(): boolean {
    if (process.platform !== 'darwin') return true
    return systemPreferences.getMediaAccessStatus('microphone') === 'granted'
  }

  public static async requestScreenRecording(): Promise<void> {
    if (process.platform !== 'darwin') return
    await shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
    )
  }

  public static async requestMicrophonePermission(): Promise<boolean> {
    if (process.platform !== 'darwin') return true
    return systemPreferences.askForMediaAccess('microphone')
  }

  public static getStatus(): AudioPermissionStatus {
    return {
      screenRecording: this.checkScreenRecording(),
      microphone: this.checkMicrophonePermission()
    }
  }
}
