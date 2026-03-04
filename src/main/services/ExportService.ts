import fs from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import type { DatabaseService } from './DatabaseService'
import { TemplateEngine, type TemplateData } from './TemplateEngine'
import type {
  ExportOptions,
  ExportResult,
  ExportTemplateSummary,
  RecordingSummaryRow,
  RecordingWithTranscript
} from '../../shared/types'

const TEMPLATE_LABELS: Record<string, string> = {
  'meeting-notes': 'Meeting Notes',
  lecture: 'Lecture Notes',
  interview: 'Interview Transcript',
  basic: 'Basic'
}

export class ExportService {
  private readonly templateEngine = new TemplateEngine()
  private templatesLoaded = false

  public constructor(private readonly databaseService: DatabaseService) {}

  public async listTemplates(): Promise<ExportTemplateSummary[]> {
    await this.ensureTemplatesLoaded()
    return this.templateEngine.listTemplates().map((name) => ({
      name,
      label: TEMPLATE_LABELS[name] ?? name
    }))
  }

  public async previewRecording(
    recording: RecordingWithTranscript,
    options: Omit<ExportOptions, 'vaultPath'> & { vaultPath?: string }
  ): Promise<{ content: string }> {
    await this.ensureTemplatesLoaded()
    const content = await this.renderMarkdown(recording, {
      ...options,
      vaultPath: options.vaultPath ?? app.getPath('temp')
    })
    return { content }
  }

  public async exportRecording(
    recording: RecordingWithTranscript,
    options: ExportOptions
  ): Promise<ExportResult> {
    await this.ensureTemplatesLoaded()
    await this.validateVaultPath(options.vaultPath)
    const content = await this.renderMarkdown(recording, options)
    const outputPath = await this.resolveOutputPath(recording, options)
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, content, 'utf-8')

    if (options.includeAudio && options.audioAsAttachment) {
      await this.copyAudioFile(recording.audioPath, outputPath)
    }
    return { path: outputPath, content }
  }

  public async exportBatch(recordingIds: number[], options: ExportOptions): Promise<string[]> {
    const paths: string[] = []
    for (const recordingId of recordingIds) {
      const recording = this.databaseService.getRecordingWithTranscript(recordingId)
      if (!recording) continue
      const summary = this.databaseService.getLatestSummary(recordingId)
      const withSummary: RecordingWithTranscript = {
        ...recording,
        summary: summary?.output
      }
      const result = await this.exportRecording(withSummary, options)
      paths.push(result.path)
    }
    return paths
  }

  private async ensureTemplatesLoaded(): Promise<void> {
    if (this.templatesLoaded) return
    const appPath = typeof app.getAppPath === 'function' ? app.getAppPath() : process.cwd()
    const templatesDir = path.join(appPath, 'resources', 'templates', 'obsidian')
    const files = await fs.readdir(templatesDir)
    for (const file of files) {
      if (!file.endsWith('.md')) continue
      const name = path.basename(file, '.md')
      const template = await fs.readFile(path.join(templatesDir, file), 'utf-8')
      this.templateEngine.loadTemplate(name, template)
    }
    this.templatesLoaded = true
  }

  private async renderMarkdown(recording: RecordingWithTranscript, options: ExportOptions): Promise<string> {
    const summary = recording.summary ?? this.resolveSummary(recording.id)?.output
    const data: TemplateData = {
      title: recording.title,
      date: recording.createdAt,
      duration: recording.duration,
      summary: summary?.summary,
      actionItems: summary?.actionItems,
      discussionPoints: summary?.discussionPoints,
      decisions: summary?.decisions,
      transcript: recording.segments.map((segment) => ({
        speaker: segment.speakerName,
        text: segment.text,
        timestamp: segment.start
      })),
      tags: recording.tags,
      category: recording.category,
      relatedRecordings: options.generateWikilinks ? this.findRelatedRecordings(recording) : [],
      audioPath: options.includeAudio ? this.getAudioLink(recording.audioPath, options.audioAsAttachment) : undefined
    }
    const frontmatter = this.generateFrontmatter(recording, summary, options.generateWikilinks)
    const body = this.templateEngine.render(options.templateName, data)
    return `${frontmatter}\n\n${body}`.trimEnd() + '\n'
  }

  private generateFrontmatter(
    recording: RecordingWithTranscript,
    summary: RecordingSummaryRow['output'] | undefined,
    generateWikilinks: boolean
  ): string {
    const speakers = Array.from(
      new Set(recording.segments.map((segment) => segment.speakerName).filter(Boolean))
    ) as string[]
    const lines: string[] = [
      '---',
      `title: ${this.escapeYaml(recording.title)}`,
      `date: ${new Date(recording.createdAt).toISOString().split('T')[0]}`,
      `duration: ${Math.floor(recording.duration)}`,
      `category: ${this.escapeYaml(recording.category ?? 'uncategorized')}`,
      `has_summary: ${summary ? 'true' : 'false'}`,
      `template_id: ${this.escapeYaml(recording.templateId ?? 'unknown')}`,
      `classification_confidence: ${recording.classificationConfidence ?? 0}`
    ]
    lines.push('tags:')
    for (const tag of recording.tags) {
      lines.push(`  - ${this.escapeYaml(tag)}`)
    }
    if (recording.tags.length === 0) {
      lines.push('  - uncategorized')
    }
    if (speakers.length > 0) {
      lines.push('speakers:')
      for (const speaker of speakers) {
        lines.push(`  - ${this.escapeYaml(speaker)}`)
      }
    }
    if (generateWikilinks) {
      lines.push('wikilinks: true')
    }
    lines.push('---')
    return lines.join('\n')
  }

  private async resolveOutputPath(recording: RecordingWithTranscript, options: ExportOptions): Promise<string> {
    let folder = options.vaultPath
    if (options.folderStructure === 'by-date') {
      const date = new Date(recording.createdAt)
      const year = String(date.getFullYear())
      const month = String(date.getMonth() + 1).padStart(2, '0')
      folder = path.join(folder, year, `${year}-${month}`)
    }
    if (options.folderStructure === 'by-category') {
      folder = path.join(folder, this.sanitizeFilename(recording.category ?? 'uncategorized'))
    }
    const base = `${this.sanitizeFilename(recording.title)}.md`
    let target = path.join(folder, base)
    let suffix = 1
    while (await this.exists(target)) {
      const next = `${this.sanitizeFilename(recording.title)}-${suffix}.md`
      target = path.join(folder, next)
      suffix += 1
    }
    return target
  }

  private findRelatedRecordings(recording: RecordingWithTranscript): Array<{ title: string; link: string }> {
    const all = this.databaseService.listRecordings({ limit: 200, includeArchived: false })
    const tagSet = new Set(recording.tags)
    return all
      .filter((candidate) => candidate.id !== recording.id)
      .filter((candidate) => {
        const sameCategory = Boolean(recording.category && candidate.category === recording.category)
        const overlapTags = candidate.tags.some((tag) => tagSet.has(tag))
        return sameCategory || overlapTags
      })
      .slice(0, 10)
      .map((candidate) => ({
        title: candidate.title,
        link: `[[${candidate.title}]]`
      }))
  }

  private getAudioLink(audioPath: string, asAttachment: boolean): string {
    if (asAttachment) {
      return `![[attachments/${path.basename(audioPath)}]]`
    }
    return `[Audio](${audioPath})`
  }

  private async copyAudioFile(audioPath: string, markdownPath: string): Promise<void> {
    const stat = await fs.stat(audioPath)
    if (stat.size > 100 * 1024 * 1024) {
      // Large files are still copied, but caller can surface warning later.
    }
    const attachmentsDir = path.join(path.dirname(markdownPath), 'attachments')
    await fs.mkdir(attachmentsDir, { recursive: true })
    await fs.copyFile(audioPath, path.join(attachmentsDir, path.basename(audioPath)))
  }

  private async validateVaultPath(vaultPath: string): Promise<void> {
    const stat = await fs.stat(vaultPath)
    if (!stat.isDirectory()) {
      throw new Error('Vault path must be a directory')
    }
    const probe = path.join(vaultPath, '.voicevault-write-test.tmp')
    await fs.writeFile(probe, 'ok', 'utf-8')
    await fs.unlink(probe)
  }

  private sanitizeFilename(name: string): string {
    const invalid = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*'])
    const sanitized = [...name]
      .map((char) => {
        const code = char.charCodeAt(0)
        if (invalid.has(char) || code < 32) {
          return '-'
        }
        return char
      })
      .join('')
      .trim()
    return sanitized || 'untitled'
  }

  private escapeYaml(value: string): string {
    return `"${value.replace(/"/g, '\\"')}"`
  }

  private async exists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath)
      return true
    } catch {
      return false
    }
  }

  private resolveSummary(recordingId: number): RecordingSummaryRow | null {
    return this.databaseService.getLatestSummary(recordingId)
  }
}
