import { ClassificationChannels } from '../../shared/ipc-channels'
import type { SummaryOutput, RecordingTemplate } from '../../shared/types'
import { getDb } from '../services/db'
import { ServiceRegistry } from '../services/registry'
import { existsSync, readFileSync, readdirSync, writeFileSync, unlinkSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getUserDataPath } from '../types'

function getTemplatesDir(): string {
  return join(getUserDataPath(), 'templates')
}

function getBuiltinTemplatesDir(): string {
  const candidates = [
    join(import.meta.dir, '../../../resources/templates'),
    join(process.cwd(), 'resources/templates')
  ]
  return candidates.find((d) => existsSync(d)) ?? candidates[0]
}

function loadTemplates(): RecordingTemplate[] {
  const templates: RecordingTemplate[] = []

  // Built-in templates
  const builtinDir = getBuiltinTemplatesDir()
  if (existsSync(builtinDir)) {
    for (const file of readdirSync(builtinDir).filter((f) => f.endsWith('.json'))) {
      try {
        const data = JSON.parse(readFileSync(join(builtinDir, file), 'utf-8')) as RecordingTemplate
        templates.push({ ...data, category: 'built-in' })
      } catch {
        // skip invalid templates
      }
    }
  }

  // Custom templates
  const customDir = getTemplatesDir()
  if (existsSync(customDir)) {
    for (const file of readdirSync(customDir).filter((f) => f.endsWith('.json'))) {
      try {
        const data = JSON.parse(readFileSync(join(customDir, file), 'utf-8')) as RecordingTemplate
        templates.push({ ...data, category: 'custom' })
      } catch {
        // skip invalid templates
      }
    }
  }

  return templates
}

function linesToList(text: string, fallback: string[] = []): string[] {
  const rows = text
    .split('\n')
    .map((line) => line.replace(/^[-*\d.)\s]+/, '').trim())
    .filter(Boolean)
  return rows.length > 0 ? rows : fallback
}

export const classificationRPCHandlers = {
  [ClassificationChannels.AUTO_CLASSIFY]: async (params: {
    transcript: string
  }): Promise<{ templateId: string; confidence: number; reasoning?: string }> => {
    const llm = ServiceRegistry.getLlmSubprocess()
    const templates = loadTemplates()
    const templateList = templates.map((t) => `- ${t.id}: ${t.name} (${t.description})`).join('\n')

    const prompt = `Classify the following transcript into one of these categories:\n${templateList}\n\nTranscript:\n${params.transcript}\n\nRespond with only the template ID.`

    let result = ''
    await llm.streamCompletion(prompt, 'gemma-2-3n-instruct-q4_k_m.gguf', (token) => {
      result += token
    })

    const matchedId = result.trim()
    const matched = templates.find((t) => t.id === matchedId)

    return {
      templateId: matched?.id ?? templates[0]?.id ?? 'unknown',
      confidence: matched ? 0.8 : 0.3,
      reasoning: result.trim()
    }
  },

  [ClassificationChannels.APPLY_TEMPLATE]: async (params: {
    recordingId: number
    templateId: string
  }): Promise<{ success: boolean; output: SummaryOutput }> => {
    const templates = loadTemplates()
    const template = templates.find((t) => t.id === params.templateId)
    if (!template) throw new Error('Template not found')

    const db = getDb()
    const segmentRows = db
      .query('SELECT text FROM transcript_segments WHERE recording_id = ? ORDER BY start_time ASC')
      .all(params.recordingId) as Array<{ text: string }>
    const transcript = segmentRows.map((s) => s.text).join(' ').trim()
    if (!transcript) throw new Error('Recording has no transcript')

    const llm = ServiceRegistry.getLlmSubprocess()
    let summary = ''
    await llm.streamCompletion(
      `${template.prompts.summary}\n\nTranscript:\n${transcript}`,
      'gemma-2-3n-instruct-q4_k_m.gguf',
      (token) => { summary += token }
    )

    let keyPoints = ''
    if (template.prompts.keyPoints) {
      await llm.streamCompletion(
        `${template.prompts.keyPoints}\n\nTranscript:\n${transcript}`,
        'gemma-2-3n-instruct-q4_k_m.gguf',
        (token) => { keyPoints += token }
      )
    }

    let actionItems = ''
    if (template.prompts.actionItems) {
      await llm.streamCompletion(
        `${template.prompts.actionItems}\n\nTranscript:\n${transcript}`,
        'gemma-2-3n-instruct-q4_k_m.gguf',
        (token) => { actionItems += token }
      )
    }

    const output: SummaryOutput = {
      summary,
      actionItems: linesToList(actionItems).map((task) => ({ task })),
      discussionPoints: linesToList(keyPoints),
      keyStatements: [],
      decisions: []
    }

    db.query(
      `INSERT INTO summaries (recording_id, summary_text, action_items, discussion_points, key_statements, decisions) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      params.recordingId,
      output.summary,
      JSON.stringify(output.actionItems),
      JSON.stringify(output.discussionPoints),
      JSON.stringify(output.keyStatements),
      JSON.stringify(output.decisions)
    )

    db.query(
      `UPDATE recordings SET template_id = ?, classification_confidence = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(params.templateId, 0.8, params.recordingId)

    return { success: true, output }
  },

  [ClassificationChannels.TEMPLATES_LIST]: async (): Promise<RecordingTemplate[]> => {
    return loadTemplates()
  },

  [ClassificationChannels.TEMPLATES_GET]: async (params: {
    id: string
  }): Promise<RecordingTemplate | null> => {
    if (typeof params.id !== 'string' || params.id.trim().length === 0) {
      throw new Error('Template id must be a non-empty string')
    }
    const templates = loadTemplates()
    return templates.find((t) => t.id === params.id) ?? null
  },

  [ClassificationChannels.TEMPLATES_CREATE]: async (params: {
    input: Partial<RecordingTemplate>
  }): Promise<RecordingTemplate> => {
    if (!params.input?.name?.trim()) throw new Error('Template name must be a non-empty string')

    const template: RecordingTemplate = {
      id: `custom-${Date.now()}`,
      name: params.input.name,
      description: params.input.description ?? '',
      icon: params.input.icon ?? '',
      color: params.input.color ?? '#6366f1',
      category: 'custom',
      keywords: params.input.keywords ?? [],
      prompts: params.input.prompts ?? { summary: 'Summarize the transcript.' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const dir = getTemplatesDir()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${template.id}.json`), JSON.stringify(template, null, 2))
    return template
  },

  [ClassificationChannels.TEMPLATES_UPDATE]: async (params: {
    id: string
    updates: Partial<RecordingTemplate>
  }): Promise<RecordingTemplate | null> => {
    if (typeof params.id !== 'string' || params.id.trim().length === 0) {
      throw new Error('Template id must be a non-empty string')
    }
    const dir = getTemplatesDir()
    const filePath = join(dir, `${params.id}.json`)
    if (!existsSync(filePath)) return null

    const existing = JSON.parse(readFileSync(filePath, 'utf-8')) as RecordingTemplate
    const updated = { ...existing, ...params.updates, id: params.id, updatedAt: new Date().toISOString() }
    writeFileSync(filePath, JSON.stringify(updated, null, 2))
    return updated
  },

  [ClassificationChannels.TEMPLATES_DELETE]: async (params: {
    id: string
  }): Promise<{ success: boolean }> => {
    if (typeof params.id !== 'string' || params.id.trim().length === 0) {
      throw new Error('Template id must be a non-empty string')
    }
    const filePath = join(getTemplatesDir(), `${params.id}.json`)
    if (existsSync(filePath)) unlinkSync(filePath)
    return { success: true }
  },

  [ClassificationChannels.TEMPLATES_EXPORT]: async (params: {
    id: string
  }): Promise<{ json: string }> => {
    if (typeof params.id !== 'string' || params.id.trim().length === 0) {
      throw new Error('Template id must be a non-empty string')
    }
    const templates = loadTemplates()
    const template = templates.find((t) => t.id === params.id)
    if (!template) throw new Error('Template not found')
    return { json: JSON.stringify(template, null, 2) }
  }
}
