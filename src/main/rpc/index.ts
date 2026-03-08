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
  SettingsChannels,
  SetupChannels,
} from '../../shared/ipc-channels'
import { checkSetup, downloadWhisperModel } from '../services/setup'
import { assertNonEmptyString } from '../utils/validate'
import {
  getLocale,
  setLocale,
  getWhisperModel,
  setWhisperModel,
  getLlmModel,
  setLlmModel
} from '../services/settings'
import { getUserDataPath } from '../types'
import { APP_VERSION } from '../../shared/constants'
import type { LlmModelName, SupportedLocale, WhisperModelSize } from '../../shared/types'

// App-level + Settings RPC handlers
const appRPCHandlers = {
  [AppChannels.GET_PATH]: (params: { name: string }): string => {
    const pathMap: Record<string, string> = {
      userData: getUserDataPath(),
      appData: getUserDataPath(),
      home: process.env.HOME ?? ''
    }
    return pathMap[params.name] ?? getUserDataPath()
  },

  [AppChannels.GET_VERSION]: (): string => process.env.VOICEVAULT_VERSION ?? APP_VERSION,

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
    setLlmModel(params.model),

  // ── Setup / First-Run ──────────────────────────────────────────────────
  [SetupChannels.CHECK]: () => checkSetup(),

  [SetupChannels.DOWNLOAD_WHISPER_MODEL]: async (params: unknown) => {
    const size = (params as any)?.size as string
    assertNonEmptyString(size)
    if (!['tiny.en', 'base.en', 'small.en'].includes(size)) {
      throw new Error(`Invalid Whisper model size: ${size}`)
    }
    const path = await downloadWhisperModel(size as 'tiny.en' | 'base.en' | 'small.en')
    return { path }
  },
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
