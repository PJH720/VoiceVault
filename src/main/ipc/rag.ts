import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import { RagChannels } from '../../shared/ipc-channels'
import { DatabaseService } from '../services/DatabaseService'
import { RAGService } from '../services/RAGService'
import { VectorService } from '../services/VectorService'
import { ServiceRegistry } from '../services/ServiceRegistry'

export function registerRAGHandlers(
  mainWindow: BrowserWindow,
  databaseService: DatabaseService
): void {
  const embeddingService = ServiceRegistry.getEmbeddingService()
  const vectorService = new VectorService(databaseService.getConnection())
  const llmService = ServiceRegistry.getLLMService()
  const ragService = new RAGService(embeddingService, vectorService, llmService)

  ipcMain.handle(RagChannels.QUERY, async (_event, question: string, topK = 5) => {
    const result = await ragService.query(question, topK)
    databaseService.saveSearchHistory(question, result.sources.length)
    return result
  })

  ipcMain.handle(RagChannels.EMBED_RECORDINGS, async (event) => {
    const targets = databaseService.listUnembeddedTranscriptSegments()
    const total = targets.length
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index]
      const embedding = await embeddingService.embed(target.text)
      vectorService.insertVector({
        recordingId: target.recordingId,
        segmentId: target.segmentId,
        text: target.text,
        embedding,
        metadata: {
          recordingTitle: target.recordingTitle,
          timestamp: target.timestamp,
          speaker: target.speaker
        }
      })
      event.sender.send(RagChannels.ON_PROGRESS, { current: index + 1, total })
      mainWindow.webContents.send(RagChannels.ON_PROGRESS, { current: index + 1, total })
    }
    return { success: true, embedded: total }
  })

  ipcMain.handle(RagChannels.SEARCH_HISTORY, () => {
    return databaseService.listSearchHistory(20)
  })

  ipcMain.handle(RagChannels.EMBEDDING_MODEL_STATUS, async () => {
    const available = await embeddingService.isModelAvailable()
    return { available }
  })

  ipcMain.handle(RagChannels.INDEX_STATUS, () => {
    const count = vectorService.getVectorCount()
    return { vectorCount: count }
  })
}
