import { BrowserWindow, ipcMain } from 'electron'
import { CloudLlmChannels } from '../../shared/ipc-channels'
import type { CloudModelName } from '../../shared/types'
import { CloudLLMService } from '../services/CloudLLMService'
import { CostEstimator } from '../services/CostEstimator'
import {
  addUsage,
  getAnthropicApiKey,
  getCloudModel,
  getLocalOnlyMode,
  getPreferredLlmProvider,
  getUsageStats,
  maskApiKey,
  resetUsageStats,
  setAnthropicApiKey,
  setCloudModel,
  setLocalOnlyMode,
  setPreferredLlmProvider
} from '../store'

export function registerCloudLlmHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(CloudLlmChannels.SET_API_KEY, (_event, key: string) => {
    setAnthropicApiKey(key.trim())
    return { success: true }
  })

  ipcMain.handle(CloudLlmChannels.GET_API_KEY, () => {
    const key = getAnthropicApiKey()
    return { key: maskApiKey(key) }
  })

  ipcMain.handle(CloudLlmChannels.SUMMARIZE, async (_event, transcript: string, model?: CloudModelName) => {
    if (getLocalOnlyMode()) {
      throw new Error('Cloud LLM disabled in local-only mode')
    }
    const apiKey = getAnthropicApiKey()
    const service = new CloudLLMService(apiKey)
    const selectedModel = model ?? getCloudModel()
    const output = await service.summarize(transcript, selectedModel, (token) => {
      mainWindow.webContents.send(CloudLlmChannels.ON_TOKEN, token)
    })
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
