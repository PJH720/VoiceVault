import { ipcMain } from 'electron'
import { ClassificationChannels } from '../../shared/ipc-channels'
import type { SummaryOutput } from '../../shared/types'
import { getLlmModel } from '../store'
import { ClassificationService } from '../services/ClassificationService'
import { DatabaseService } from '../services/DatabaseService'
import { LLMService } from '../services/LLMService'
import { TemplateManager } from '../services/TemplateManager'

function linesToList(text: string, fallback: string[] = []): string[] {
  const rows = text
    .split('\n')
    .map((line) => line.replace(/^[-*\d.)\s]+/, '').trim())
    .filter(Boolean)
  return rows.length > 0 ? rows : fallback
}

export function registerClassificationHandlers(databaseService: DatabaseService): void {
  const templateManager = new TemplateManager()
  const llmService = new LLMService(getLlmModel())
  const classificationService = new ClassificationService(llmService, templateManager)

  ipcMain.handle(ClassificationChannels.AUTO_CLASSIFY, async (_event, transcript: string) => {
    return classificationService.classifyRecording(transcript)
  })

  ipcMain.handle(
    ClassificationChannels.APPLY_TEMPLATE,
    async (_event, recordingId: number, templateId: string): Promise<{ success: boolean; output: SummaryOutput }> => {
      const template = await templateManager.getTemplate(templateId)
      if (!template) throw new Error('Template not found')
      const recording = databaseService.getRecordingWithTranscript(recordingId)
      if (!recording) throw new Error('Recording not found')
      const transcript = recording.segments.map((segment) => segment.text).join(' ').trim()
      const summary = await llmService.answerQuestion(template.prompts.summary, transcript)
      const keyPoints = template.prompts.keyPoints
        ? await llmService.answerQuestion(template.prompts.keyPoints, transcript)
        : ''
      const actionItems = template.prompts.actionItems
        ? await llmService.answerQuestion(template.prompts.actionItems, transcript)
        : ''

      const output: SummaryOutput = {
        summary,
        actionItems: linesToList(actionItems).map((task) => ({ task })),
        discussionPoints: linesToList(keyPoints),
        keyStatements: [],
        decisions: []
      }
      databaseService.saveSummary(recordingId, output)
      databaseService.setRecordingClassification(recordingId, templateId, 0.8)
      return { success: true, output }
    }
  )

  ipcMain.handle(ClassificationChannels.TEMPLATES_LIST, async () => templateManager.listTemplates())
  ipcMain.handle(ClassificationChannels.TEMPLATES_GET, async (_event, id: string) => templateManager.getTemplate(id))
  ipcMain.handle(ClassificationChannels.TEMPLATES_CREATE, async (_event, input) =>
    templateManager.createTemplate(input)
  )
  ipcMain.handle(ClassificationChannels.TEMPLATES_UPDATE, async (_event, id: string, updates) =>
    templateManager.updateTemplate(id, updates)
  )
  ipcMain.handle(ClassificationChannels.TEMPLATES_DELETE, async (_event, id: string) => {
    await templateManager.deleteTemplate(id)
    return { success: true }
  })
  ipcMain.handle(ClassificationChannels.TEMPLATES_EXPORT, async (_event, id: string) => {
    return { json: await templateManager.exportTemplate(id) }
  })
}
