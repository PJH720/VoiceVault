import { ExportChannels } from '../../shared/ipc-channels'
import type { ExportOptions, ExportResult, ExportTemplateSummary } from '../../shared/types'
import { getObsidianVaultPath, setObsidianVaultPath } from '../services/settings'
import { getDb } from '../services/db'
import { existsSync, readFileSync, readdirSync, mkdirSync } from 'fs'
import { join, basename } from 'path'

function getExportTemplatesDir(): string {
  const candidates = [
    join(import.meta.dir, '../../../resources/templates/export'),
    join(process.cwd(), 'resources/templates/export')
  ]
  return candidates.find((d) => existsSync(d)) ?? candidates[0]
}

export const exportRPCHandlers = {
  [ExportChannels.OBSIDIAN]: async (params: {
    recordingId: number
    options: ExportOptions
  }): Promise<ExportResult> => {
    const db = getDb()
    const recording = db
      .query(
        'SELECT id, title, duration, audio_path, created_at, updated_at, category, tags FROM recordings WHERE id = ?'
      )
      .get(params.recordingId) as Record<string, unknown> | undefined

    if (!recording) throw new Error('Recording not found')

    const segments = db
      .query('SELECT text FROM transcript_segments WHERE recording_id = ? ORDER BY start_time ASC')
      .all(params.recordingId) as Array<{ text: string }>

    const transcript = segments.map((s) => s.text).join('\n')
    const summaryRow = db
      .query(
        'SELECT summary_text FROM summaries WHERE recording_id = ? ORDER BY id DESC LIMIT 1'
      )
      .get(params.recordingId) as { summary_text: string } | undefined

    const title = recording.title as string
    const content = [
      `# ${title}`,
      '',
      `**Date:** ${recording.created_at}`,
      `**Duration:** ${recording.duration}s`,
      '',
      summaryRow ? `## Summary\n\n${summaryRow.summary_text}\n` : '',
      '## Transcript',
      '',
      transcript
    ]
      .filter(Boolean)
      .join('\n')

    const vaultPath = params.options.vaultPath
    if (!existsSync(vaultPath)) mkdirSync(vaultPath, { recursive: true })

    const outputPath = join(vaultPath, `${title.replace(/[/\\:*?"<>|]/g, '_')}.md`)
    await Bun.write(outputPath, content)

    return { path: outputPath, content }
  },

  [ExportChannels.BATCH]: async (params: {
    recordingIds: number[]
    options: ExportOptions
  }): Promise<{ paths: string[] }> => {
    const paths: string[] = []
    for (const id of params.recordingIds) {
      const result = await exportRPCHandlers[ExportChannels.OBSIDIAN]({
        recordingId: id,
        options: params.options
      })
      paths.push(result.path)
    }
    return { paths }
  },

  [ExportChannels.PREVIEW]: async (params: {
    recordingId: number
    templateName: string
  }): Promise<ExportResult> => {
    if (typeof params.recordingId !== 'number' || !Number.isFinite(params.recordingId)) {
      throw new Error('Invalid recordingId')
    }
    if (typeof params.templateName !== 'string' || params.templateName.trim().length === 0) {
      throw new Error('templateName must be a non-empty string')
    }

    // Preview without writing to disk
    const db = getDb()
    const recording = db
      .query('SELECT id, title, created_at, duration FROM recordings WHERE id = ?')
      .get(params.recordingId) as Record<string, unknown> | undefined

    if (!recording) throw new Error('Recording not found')

    const segments = db
      .query('SELECT text FROM transcript_segments WHERE recording_id = ? ORDER BY start_time ASC')
      .all(params.recordingId) as Array<{ text: string }>

    const content = `# ${recording.title}\n\n${segments.map((s) => s.text).join('\n')}`
    return { path: '', content }
  },

  [ExportChannels.SET_VAULT_PATH]: async (params?: {
    path?: string
  }): Promise<{ path: string | null }> => {
    // In Electrobun, directory picker would go through a native dialog API.
    // For now, accept the path directly from params.
    if (!params?.path) return { path: null }
    return { path: setObsidianVaultPath(params.path) }
  },

  [ExportChannels.GET_VAULT_PATH]: (): { path: string | null } => {
    return { path: getObsidianVaultPath() }
  },

  [ExportChannels.GET_TEMPLATES]: async (): Promise<{ templates: ExportTemplateSummary[] }> => {
    const dir = getExportTemplatesDir()
    if (!existsSync(dir)) return { templates: [] }

    const templates: ExportTemplateSummary[] = readdirSync(dir)
      .filter((f) => f.endsWith('.md') || f.endsWith('.hbs'))
      .map((f) => ({
        name: basename(f, f.endsWith('.md') ? '.md' : '.hbs'),
        label: basename(f, f.endsWith('.md') ? '.md' : '.hbs')
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase())
      }))

    return { templates }
  }
}
