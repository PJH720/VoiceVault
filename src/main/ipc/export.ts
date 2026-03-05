import { dialog, ipcMain } from 'electron'
import { ExportChannels } from '../../shared/ipc-channels'
import type { ExportOptions } from '../../shared/types'
import { getObsidianVaultPath, setObsidianVaultPath } from '../store'
import { DatabaseService } from '../services/DatabaseService'
import { ExportService } from '../services/ExportService'

export function registerExportHandlers(databaseService: DatabaseService): void {
  const exportService = new ExportService(databaseService)

  ipcMain.handle(
    ExportChannels.OBSIDIAN,
    async (_event, recordingId: number, options: ExportOptions) => {
      const recording = databaseService.getRecordingWithTranscript(recordingId)
      if (!recording) {
        throw new Error('Recording not found')
      }
      const summary = databaseService.getLatestSummary(recordingId)
      return exportService.exportRecording({ ...recording, summary: summary?.output }, options)
    }
  )

  ipcMain.handle(
    ExportChannels.BATCH,
    async (_event, recordingIds: number[], options: ExportOptions) => {
      const paths = await exportService.exportBatch(recordingIds, options)
      return { paths }
    }
  )

  ipcMain.handle(
    ExportChannels.PREVIEW,
    async (_event, recordingId: number, templateName: string) => {
      if (typeof recordingId !== 'number' || !Number.isFinite(recordingId)) {
        throw new Error('Invalid recordingId')
      }
      if (typeof templateName !== 'string' || templateName.trim().length === 0) {
        throw new Error('templateName must be a non-empty string')
      }
      const recording = databaseService.getRecordingWithTranscript(recordingId)
      if (!recording) {
        throw new Error('Recording not found')
      }
      const summary = databaseService.getLatestSummary(recordingId)
      return exportService.previewRecording(
        { ...recording, summary: summary?.output },
        {
          templateName,
          folderStructure: 'flat',
          includeAudio: false,
          audioAsAttachment: false,
          generateWikilinks: true
        }
      )
    }
  )

  ipcMain.handle(ExportChannels.SET_VAULT_PATH, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Obsidian Vault'
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { path: null as string | null }
    }
    return { path: setObsidianVaultPath(result.filePaths[0]) }
  })

  ipcMain.handle(ExportChannels.GET_VAULT_PATH, () => {
    return { path: getObsidianVaultPath() }
  })

  ipcMain.handle(ExportChannels.GET_TEMPLATES, async () => {
    return { templates: await exportService.listTemplates() }
  })
}
