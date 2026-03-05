import { BrowserWindow, ipcMain } from 'electron'
import { CloudLlmChannels } from '../../shared/ipc-channels'
import type { CloudModelName, AnthropicModelName, OpenAIModelName, GeminiModelName } from '../../shared/types'
import { CloudLLMService } from '../services/CloudLLMService'
import { CostEstimator } from '../services/CostEstimator'
import {
  addUsage,
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
} from '../store'

function isAnthropicModel(model: CloudModelName): model is AnthropicModelName {
  return model.startsWith('claude-')
}

function isOpenAIModel(model: CloudModelName): model is OpenAIModelName {
  return model.startsWith('gpt-')
}

function isGeminiModel(model: CloudModelName): model is GeminiModelName {
  return model.startsWith('gemini-')
}

export function registerCloudLlmHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(CloudLlmChannels.SET_API_KEY, (_event, key: string) => {
    setAnthropicApiKey(key.trim())
    return { success: true }
  })

  ipcMain.handle(CloudLlmChannels.GET_API_KEY, () => {
    const key = getAnthropicApiKey()
    return { key: maskApiKey(key) }
  })

  ipcMain.handle(CloudLlmChannels.SET_OPENAI_API_KEY, (_event, key: string) => {
    setOpenAIApiKey(key.trim())
    return { success: true }
  })

  ipcMain.handle(CloudLlmChannels.GET_OPENAI_API_KEY, () => {
    const key = getOpenAIApiKey()
    return { key: maskApiKey(key) }
  })

  ipcMain.handle(CloudLlmChannels.SET_GEMINI_API_KEY, (_event, key: string) => {
    setGeminiApiKey(key.trim())
    return { success: true }
  })

  ipcMain.handle(CloudLlmChannels.GET_GEMINI_API_KEY, () => {
    const key = getGeminiApiKey()
    return { key: maskApiKey(key) }
  })

  ipcMain.handle(CloudLlmChannels.SUMMARIZE, async (_event, transcript: string, model?: CloudModelName) => {
    if (getLocalOnlyMode()) {
      throw new Error('Cloud LLM disabled in local-only mode')
    }
    const anthropicApiKey = getAnthropicApiKey()
    const openaiApiKey = getOpenAIApiKey()
    const geminiApiKey = getGeminiApiKey()
    const service = new CloudLLMService(anthropicApiKey, openaiApiKey, geminiApiKey)
    const selectedModel = model ?? getCloudModel()

    let output
    if (isAnthropicModel(selectedModel)) {
      output = await service.summarize(transcript, selectedModel, (token) => {
        mainWindow.webContents.send(CloudLlmChannels.ON_TOKEN, token)
      })
    } else if (isOpenAIModel(selectedModel)) {
      output = await service.summarizeWithOpenAI(transcript, selectedModel, (token) => {
        mainWindow.webContents.send(CloudLlmChannels.ON_TOKEN, token)
      })
    } else if (isGeminiModel(selectedModel)) {
      output = await service.summarizeWithGemini(transcript, selectedModel, (token) => {
        mainWindow.webContents.send(CloudLlmChannels.ON_TOKEN, token)
      })
    } else {
      throw new Error(`Unsupported model: ${selectedModel}`)
    }

    addUsage(output.metadata?.cost ?? 0)
    mainWindow.webContents.send(CloudLlmChannels.ON_COMPLETE, output)
    return { success: true, output }
  })

  ipcMain.handle(CloudLlmChannels.ESTIMATE_COST, (_event, text: string, model: CloudModelName) => {
    return CostEstimator.estimateCost(text, model)
  })

  ipcMain.handle(CloudLlmChannels.USAGE_STATS, () => getUsageStats())
  ipcMain.handle(CloudLlmChannels.RESET_STATS, () => resetUsageStats())

  ipcMain.handle(CloudLlmChannels.SET_LOCAL_ONLY, (_event, enabled: boolean) => {
    return { enabled: setLocalOnlyMode(enabled) }
  })

  ipcMain.handle(CloudLlmChannels.GET_LOCAL_ONLY, () => ({ enabled: getLocalOnlyMode() }))

  ipcMain.handle(CloudLlmChannels.SET_PROVIDER, (_event, provider: 'local' | 'cloud') => {
    return { provider: setPreferredLlmProvider(provider) }
  })

  ipcMain.handle(CloudLlmChannels.GET_PROVIDER, () => ({ provider: getPreferredLlmProvider() }))

  ipcMain.handle(CloudLlmChannels.SET_MODEL, (_event, model: CloudModelName) => {
    return { model: setCloudModel(model) }
  })

  ipcMain.handle(CloudLlmChannels.GET_MODEL, () => ({ model: getCloudModel() }))
}
