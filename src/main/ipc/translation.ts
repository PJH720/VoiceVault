import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import { TranslationChannels } from '../../shared/ipc-channels'
import type { BatchTranslationItem } from '../../shared/types'
import { getTranslationTargetLanguage, setTranslationTargetLanguage } from '../store'
import { DatabaseService } from '../services/DatabaseService'
import { LLMService } from '../services/LLMService'
import { getLlmModel } from '../store'
import { TranslationService } from '../services/TranslationService'

export function registerTranslationHandlers(
  mainWindow: BrowserWindow,
  databaseService: DatabaseService
): void {
  const llmService = new LLMService(getLlmModel())
  const translationService = new TranslationService(databaseService.getConnection(), llmService)

  ipcMain.handle(
    TranslationChannels.TRANSLATE,
    async (_event, text: string, sourceLanguage: string, targetLanguage: string, segmentId?: number) => {
      return translationService.translate(text, sourceLanguage, targetLanguage, segmentId)
    }
  )

  ipcMain.handle(
    TranslationChannels.BATCH_TRANSLATE,
    async (_event, items: BatchTranslationItem[], sourceLanguage: string, targetLanguage: string) => {
      const map = await translationService.batchTranslate(
        items,
        sourceLanguage,
        targetLanguage,
        (current, total, result, id) => {
          const payload = { current, total }
          mainWindow.webContents.send(TranslationChannels.ON_PROGRESS, payload)
          mainWindow.webContents.send(TranslationChannels.ON_TRANSLATED, { id, result })
        }
      )
      return Array.from(map.entries()).map(([id, result]) => ({ id, result }))
    }
  )

  ipcMain.handle(TranslationChannels.GET_LANGUAGES, async () => {
    return { languages: translationService.getSupportedLanguages() }
  })

  ipcMain.handle(TranslationChannels.SET_TARGET_LANGUAGE, async (_event, language: string) => {
    const applied = setTranslationTargetLanguage(language)
    translationService.clearMemoryCache()
    return { language: applied }
  })

  ipcMain.handle(TranslationChannels.GET_TARGET_LANGUAGE, async () => {
    return { language: getTranslationTargetLanguage() }
  })
}
