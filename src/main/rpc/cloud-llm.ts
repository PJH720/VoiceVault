import { CloudLlmChannels } from '../../shared/ipc-channels'
import type { CloudModelName } from '../../shared/types'
import { assertString, assertBoolean } from '../utils/validate'
import {
  getAnthropicApiKey,
  getOpenAIApiKey,
  getGeminiApiKey,
  getCloudModel,
  getLocalOnlyMode,
  getPreferredLlmProvider,
  getUsageStats,
  maskApiKey,
  resetUsageStats,
  setAnthropicApiKey,
  setOpenAIApiKey,
  setGeminiApiKey,
  setCloudModel,
  setLocalOnlyMode,
  setPreferredLlmProvider
} from '../services/settings'

export const cloudLlmRPCHandlers = {
  [CloudLlmChannels.SET_API_KEY]: (params: { key: string }): { success: boolean } => {
    assertString(params.key, 'API key')
    setAnthropicApiKey(params.key.trim())
    return { success: true }
  },

  [CloudLlmChannels.GET_API_KEY]: (): { key: string | null } => {
    return { key: maskApiKey(getAnthropicApiKey()) }
  },

  [CloudLlmChannels.SET_OPENAI_API_KEY]: (params: { key: string }): { success: boolean } => {
    assertString(params.key, 'API key')
    setOpenAIApiKey(params.key.trim())
    return { success: true }
  },

  [CloudLlmChannels.GET_OPENAI_API_KEY]: (): { key: string | null } => {
    return { key: maskApiKey(getOpenAIApiKey()) }
  },

  [CloudLlmChannels.SET_GEMINI_API_KEY]: (params: { key: string }): { success: boolean } => {
    assertString(params.key, 'API key')
    setGeminiApiKey(params.key.trim())
    return { success: true }
  },

  [CloudLlmChannels.GET_GEMINI_API_KEY]: (): { key: string | null } => {
    return { key: maskApiKey(getGeminiApiKey()) }
  },

  [CloudLlmChannels.SUMMARIZE]: async (params: {
    transcript: string
    model?: CloudModelName
  }): Promise<{ success: boolean; output: unknown }> => {
    if (getLocalOnlyMode()) {
      throw new Error('Cloud LLM disabled in local-only mode')
    }

    const selectedModel = params.model ?? getCloudModel()

    // Cloud LLM summarization — uses the same SDK approach as the Electron version.
    // The actual SDK imports (anthropic, openai, google) are deferred to avoid
    // loading unused SDKs. This scaffold defines the interface.
    throw new Error(
      `Cloud LLM summarization not yet implemented for Electrobun. Model: ${selectedModel}`
    )
  },

  [CloudLlmChannels.ESTIMATE_COST]: (params: {
    text: string
    model: CloudModelName
  }): { inputTokens: number; outputTokens: number; estimatedCost: number } => {
    if (typeof params.text !== 'string' || params.text.length === 0) {
      throw new Error('Text must be a non-empty string')
    }
    // Rough estimate: 1 token ~= 4 characters
    const inputTokens = Math.ceil(params.text.length / 4)
    const outputTokens = Math.ceil(inputTokens * 0.3)
    return { inputTokens, outputTokens, estimatedCost: 0 }
  },

  [CloudLlmChannels.USAGE_STATS]: () => getUsageStats(),
  [CloudLlmChannels.RESET_STATS]: () => resetUsageStats(),

  [CloudLlmChannels.SET_LOCAL_ONLY]: (params: {
    enabled: boolean
  }): { enabled: boolean } => {
    assertBoolean(params.enabled, 'enabled')
    return { enabled: setLocalOnlyMode(params.enabled) }
  },

  [CloudLlmChannels.GET_LOCAL_ONLY]: (): { enabled: boolean } => {
    return { enabled: getLocalOnlyMode() }
  },

  [CloudLlmChannels.SET_PROVIDER]: (params: {
    provider: 'local' | 'cloud'
  }): { provider: 'local' | 'cloud' } => {
    if (params.provider !== 'local' && params.provider !== 'cloud') {
      throw new Error('Provider must be "local" or "cloud"')
    }
    return { provider: setPreferredLlmProvider(params.provider) }
  },

  [CloudLlmChannels.GET_PROVIDER]: (): { provider: 'local' | 'cloud' } => {
    return { provider: getPreferredLlmProvider() }
  },

  [CloudLlmChannels.SET_MODEL]: (params: { model: CloudModelName }): { model: CloudModelName } => {
    assertString(params.model, 'model')
    return { model: setCloudModel(params.model) }
  },

  [CloudLlmChannels.GET_MODEL]: (): { model: CloudModelName } => {
    return { model: getCloudModel() }
  }
}
