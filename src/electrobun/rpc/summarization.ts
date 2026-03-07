import { LlmChannels } from '../../shared/ipc-channels'
import type { LlmModelName, SummaryOutput } from '../../shared/types'
import { ServiceRegistry } from '../services/registry'
import { getDb } from '../services/db'
import { getLlmModel, setLlmModel } from '../services/settings'

let cancelled = false

export const summarizationRPCHandlers = {
  [LlmChannels.SUMMARIZE_STREAM]: async (params: {
    transcript: string
    type?: string
    previousSummary?: string
  }): Promise<{ success: boolean; output: SummaryOutput | null; cancelled: boolean }> => {
    cancelled = false
    const llm = ServiceRegistry.getLlmSubprocess()
    const modelName = getLlmModel()
    const modelPath = `${modelName}.gguf`

    // Build summarization prompt
    const systemPrompt = params.type === 'interim'
      ? 'You are a summarizer. Provide a brief interim summary of the following transcript.'
      : 'You are a summarizer. Provide a comprehensive summary of the following transcript. Include action items, discussion points, key statements, and decisions.'

    const prompt = params.previousSummary
      ? `${systemPrompt}\n\nPrevious summary:\n${params.previousSummary}\n\nNew transcript:\n${params.transcript}`
      : `${systemPrompt}\n\nTranscript:\n${params.transcript}`

    let fullOutput = ''
    await llm.streamCompletion(prompt, modelPath, (token) => {
      if (cancelled) return
      fullOutput += token
      // Token streaming is handled via RPC messages in the actual implementation
    })

    if (cancelled) {
      return { success: true, output: null, cancelled: true }
    }

    const output: SummaryOutput = {
      summary: fullOutput,
      actionItems: [],
      discussionPoints: [],
      keyStatements: [],
      decisions: []
    }

    return { success: true, output, cancelled: false }
  },

  [LlmChannels.STOP]: async (): Promise<{ success: boolean }> => {
    cancelled = true
    ServiceRegistry.getLlmSubprocess().unload()
    return { success: true }
  },

  [LlmChannels.DOWNLOAD_MODEL]: async (params: {
    modelName: LlmModelName
  }): Promise<{ success: boolean }> => {
    const llm = ServiceRegistry.getLlmSubprocess()
    setLlmModel(params.modelName)
    await llm.downloadModel(params.modelName)
    return { success: true }
  },

  [LlmChannels.MODEL_STATUS]: async (params?: {
    modelName?: LlmModelName
  }): Promise<{ modelName: LlmModelName; available: boolean }> => {
    const llm = ServiceRegistry.getLlmSubprocess()
    const target = params?.modelName ?? getLlmModel()
    const status = await llm.getModelStatus(`${target}.gguf`)
    return { modelName: target, available: status.loaded }
  },

  [LlmChannels.UNLOAD]: async (): Promise<{ success: boolean }> => {
    ServiceRegistry.getLlmSubprocess().unload()
    return { success: true }
  },

  [LlmChannels.SAVE_SUMMARY]: (params: {
    recordingId: number
    output: SummaryOutput
  }): { id: number } => {
    const db = getDb()
    const result = db
      .query(
        `INSERT INTO summaries (recording_id, summary_text, action_items, discussion_points, key_statements, decisions) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        params.recordingId,
        params.output.summary,
        JSON.stringify(params.output.actionItems),
        JSON.stringify(params.output.discussionPoints),
        JSON.stringify(params.output.keyStatements),
        JSON.stringify(params.output.decisions)
      )
    return { id: Number(result.lastInsertRowid) }
  },

  [LlmChannels.GET_LATEST_SUMMARY]: (params: { recordingId: number }) => {
    const db = getDb()
    const row = db
      .query(
        `SELECT id, recording_id, summary_text, action_items, discussion_points, key_statements, decisions, created_at FROM summaries WHERE recording_id = ? ORDER BY id DESC LIMIT 1`
      )
      .get(params.recordingId) as Record<string, unknown> | undefined

    if (!row) return null

    return {
      id: row.id as number,
      recordingId: row.recording_id as number,
      createdAt: row.created_at as string,
      output: {
        summary: row.summary_text as string,
        actionItems: row.action_items ? JSON.parse(row.action_items as string) : [],
        discussionPoints: row.discussion_points ? JSON.parse(row.discussion_points as string) : [],
        keyStatements: row.key_statements ? JSON.parse(row.key_statements as string) : [],
        decisions: row.decisions ? JSON.parse(row.decisions as string) : []
      }
    }
  }
}
