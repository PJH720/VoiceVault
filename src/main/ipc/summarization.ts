import { BrowserWindow, ipcMain } from 'electron'
import { LlmChannels } from '../../shared/ipc-channels'
import type { LlmModelName, SummaryOutput } from '../../shared/types'
import { setLlmModel } from '../store'
import { DatabaseService } from '../services/DatabaseService'
import type { SummaryPromptType } from '../services/PromptService'
import { ServiceRegistry } from '../services/ServiceRegistry'

export function registerSummarizationHandlers(
  mainWindow: BrowserWindow,
  databaseService: DatabaseService
): void {
  const llmService = ServiceRegistry.getLLMService()
  let cancelled = false

  ipcMain.handle(
    LlmChannels.SUMMARIZE_STREAM,
    async (
      _event,
      transcript: string,
      type: SummaryPromptType = 'final',
      previousSummary = ''
    ): Promise<{ success: boolean; output: SummaryOutput | null; cancelled: boolean }> => {
      cancelled = false
      const output = await llmService.summarize(transcript, type, previousSummary, (token) => {
        if (cancelled) return
        mainWindow.webContents.send(LlmChannels.ON_TOKEN, token)
      })
      if (cancelled) {
        return { success: true, output: null, cancelled: true }
      }
      mainWindow.webContents.send(LlmChannels.ON_COMPLETE, output)
      return { success: true, output, cancelled: false }
    }
  )

  ipcMain.handle(LlmChannels.STOP, async () => {
    cancelled = true
    return { success: true }
  })

  ipcMain.handle(LlmChannels.DOWNLOAD_MODEL, async (event, modelName: LlmModelName) => {
    llmService.setModel(modelName)
    setLlmModel(modelName)
    await llmService.downloadModel(modelName, (percent, downloaded, total) => {
      event.sender.send(LlmChannels.ON_DOWNLOAD_PROGRESS, {
        modelName,
        percent,
        downloaded,
        total
      })
    })
    return { success: true }
  })

  ipcMain.handle(LlmChannels.MODEL_STATUS, async (_event, modelName?: LlmModelName) => {
    const targetModel = modelName ?? llmService.getModel()
    const available = await llmService.isModelAvailable(targetModel)
    return { modelName: targetModel, available }
  })

  ipcMain.handle(LlmChannels.UNLOAD, async () => {
    await llmService.unload()
    return { success: true }
  })

  ipcMain.handle(LlmChannels.SAVE_SUMMARY, (_event, recordingId: number, output: SummaryOutput) => {
    const id = databaseService.saveSummary(recordingId, output)
    return { id }
  })

  ipcMain.handle(LlmChannels.GET_LATEST_SUMMARY, (_event, recordingId: number) => {
    return databaseService.getLatestSummary(recordingId)
  })
}
