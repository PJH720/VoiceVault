import { SystemAudioChannels } from '../../shared/ipc-channels'
import type { AudioPermissionStatus, AudioSourceInfo, CaptureConfig } from '../../shared/types'

export const systemAudioRPCHandlers = {
  [SystemAudioChannels.LIST_SOURCES]: async (): Promise<{
    sources: AudioSourceInfo[]
  }> => {
    // System audio source listing requires native integration.
    // In Electrobun, this will use platform-specific Bun.spawn commands.
    return { sources: [] }
  },

  [SystemAudioChannels.START_CAPTURE]: async (params: {
    config: CaptureConfig
  }): Promise<{ success: boolean }> => {
    if (params.config == null || typeof params.config !== 'object') {
      throw new Error('Capture config must be an object')
    }
    const VALID_MIX_MODES = ['mic-only', 'system-only', 'both']
    if (!VALID_MIX_MODES.includes(params.config.mixMode)) {
      throw new Error(`Invalid mixMode "${params.config.mixMode}"`)
    }
    if (
      typeof params.config.micVolume !== 'number' ||
      params.config.micVolume < 0 ||
      params.config.micVolume > 1
    ) {
      throw new Error('micVolume must be a number between 0 and 1')
    }
    if (
      typeof params.config.systemVolume !== 'number' ||
      params.config.systemVolume < 0 ||
      params.config.systemVolume > 1
    ) {
      throw new Error('systemVolume must be a number between 0 and 1')
    }

    // TODO: Implement via Bun.spawn with system audio capture binary
    throw new Error('System audio capture not yet implemented for Electrobun')
  },

  [SystemAudioChannels.STOP_CAPTURE]: async (): Promise<{ success: boolean }> => {
    return { success: true }
  },

  [SystemAudioChannels.CHECK_PERMISSIONS]: async (): Promise<AudioPermissionStatus> => {
    // Permission checks are platform-specific
    return { screenRecording: false, microphone: true }
  },

  [SystemAudioChannels.REQUEST_PERMISSIONS]: async (params: {
    type: 'screen' | 'microphone'
  }): Promise<{ success: boolean; permissions: AudioPermissionStatus }> => {
    if (params.type !== 'screen' && params.type !== 'microphone') {
      throw new Error('Permission type must be "screen" or "microphone"')
    }
    return {
      success: true,
      permissions: { screenRecording: false, microphone: true }
    }
  }
}
