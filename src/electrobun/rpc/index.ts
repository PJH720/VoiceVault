import { audioRPCHandlers } from './audio'
import { databaseRPCHandlers } from './database'
import { transcriptionRPCHandlers } from './transcription'
import { summarizationRPCHandlers } from './summarization'
import { classificationRPCHandlers } from './classification'
import { cloudLlmRPCHandlers } from './cloud-llm'
import { diarizationRPCHandlers } from './diarization'
import { ragRPCHandlers } from './rag'
import { exportRPCHandlers } from './export'
import { systemAudioRPCHandlers } from './system-audio'
import { translationRPCHandlers } from './translation'
import {
  AppChannels,
  SettingsChannels
} from '../../shared/ipc-channels'
import {
  getLocale,
  setLocale,
  getWhisperModel,
  setWhisperModel,
  getLlmModel,
  setLlmModel
} from '../services/settings'
import { getUserDataPath } from '../types'
import type { LlmModelName, SupportedLocale, WhisperModelSize } from '../../shared/types'

// App-level + Settings RPC handlers (ported from src/main/index.ts inline handlers)
const appRPCHandlers = {
  [AppChannels.GET_PATH]: (params: { name: string }): string => {
    // In Electrobun, paths resolve from the user data path
    const pathMap: Record<string, string> = {
      userData: getUserDataPath(),
      appData: getUserDataPath(),
      home: process.env.HOME ?? ''
    }
    return pathMap[params.name] ?? getUserDataPath()
  },

  [AppChannels.GET_VERSION]: (): string => {
    return process.env.VOICEVAULT_VERSION ?? '0.6.0'
  },

  [AppChannels.REPORT_ERROR]: (params: {
    message: string
    stack?: string
    page?: string
  }): void => {
    console.error(`[ErrorBoundary] ${params.page ?? 'unknown'}: ${params.message}`)
    if (params.stack) console.error(params.stack)
  },

  [SettingsChannels.GET_LOCALE]: (): SupportedLocale => getLocale(),
  [SettingsChannels.SET_LOCALE]: (params: { locale: SupportedLocale }): SupportedLocale =>
    setLocale(params.locale),
  [SettingsChannels.GET_WHISPER_MODEL]: (): WhisperModelSize => getWhisperModel(),
  [SettingsChannels.SET_WHISPER_MODEL]: (params: { model: WhisperModelSize }): WhisperModelSize =>
    setWhisperModel(params.model),
  [SettingsChannels.GET_LLM_MODEL]: (): LlmModelName => getLlmModel(),
  [SettingsChannels.SET_LLM_MODEL]: (params: { model: LlmModelName }): LlmModelName =>
    setLlmModel(params.model)
}

/**
 * All RPC request handlers combined into a single object.
 * Used by BrowserView.defineRPC({ handlers: { requests: allRPCHandlers } })
 */
export const allRPCHandlers: Record<string, (...args: unknown[]) => unknown> = {
  ...appRPCHandlers,
  ...audioRPCHandlers,
  ...databaseRPCHandlers,
  ...transcriptionRPCHandlers,
  ...summarizationRPCHandlers,
  ...classificationRPCHandlers,
  ...cloudLlmRPCHandlers,
  ...diarizationRPCHandlers,
  ...ragRPCHandlers,
  ...exportRPCHandlers,
  ...systemAudioRPCHandlers,
  ...translationRPCHandlers
} as Record<string, (...args: unknown[]) => unknown>
