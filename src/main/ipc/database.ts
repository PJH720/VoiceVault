import { ipcMain } from 'electron'
import fs from 'node:fs'
import { DatabaseChannels } from '../../shared/ipc-channels'
import type { ListOptions, Recording, RecordingWithTranscript } from '../../shared/types'
import { DatabaseService } from '../services/DatabaseService'

export function registerDatabaseHandlers(databaseService: DatabaseService): void {
  ipcMain.handle(DatabaseChannels.LIST, (_event, options?: ListOptions): Recording[] => {
    return databaseService.listRecordings(options)
  })

  ipcMain.handle(DatabaseChannels.GET, (_event, id: number): RecordingWithTranscript | null => {
    return databaseService.getRecordingWithTranscript(id)
  })

  ipcMain.handle(
    DatabaseChannels.CREATE,
    (_event, title: string, duration: number, audioPath: string): Recording | null => {
      return databaseService.createRecording(title, duration, audioPath)
    }
  )

  ipcMain.handle(DatabaseChannels.SEARCH, (_event, query: string, options?: ListOptions): Recording[] => {
    return databaseService.searchRecordings(query, options)
  })

  ipcMain.handle(
    DatabaseChannels.UPDATE,
    (_event, id: number, data: Partial<Recording>): Recording | null => {
      return databaseService.updateRecording(id, {
        title: data.title,
        category: data.category,
        isBookmarked: data.isBookmarked
      })
    }
  )

  ipcMain.handle(DatabaseChannels.DELETE, (_event, id: number, hard = false): Recording | null => {
    const deleted = databaseService.deleteRecording(id, hard)
    if (hard && deleted?.audioPath && fs.existsSync(deleted.audioPath)) {
      fs.unlinkSync(deleted.audioPath)
    }
    return deleted
  })
}
