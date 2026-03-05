import fs from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import type { RecordingTemplate } from '../../shared/types'

type NewTemplateInput = Omit<RecordingTemplate, 'id' | 'category' | 'createdAt' | 'updatedAt'>

export class TemplateManager {
  private readonly builtInPath: string
  private readonly customPath: string
  private readonly templates = new Map<string, RecordingTemplate>()
  private initialized = false

  public constructor() {
    const appPath = typeof app.getAppPath === 'function' ? app.getAppPath() : process.cwd()
    this.builtInPath = path.join(appPath, 'resources', 'templates', 'classification')
    this.customPath = path.join(app.getPath('userData'), 'templates')
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return
    await this.loadBuiltInTemplates()
    await this.loadCustomTemplates()
    this.initialized = true
  }

  public async listTemplates(): Promise<RecordingTemplate[]> {
    await this.initialize()
    return Array.from(this.templates.values()).sort((left, right) =>
      left.name.localeCompare(right.name)
    )
  }

  public async getTemplate(id: string): Promise<RecordingTemplate | null> {
    await this.initialize()
    return this.templates.get(id) ?? null
  }

  public async createTemplate(input: NewTemplateInput): Promise<RecordingTemplate> {
    await this.initialize()
    const id = this.generateId(input.name)
    if (this.templates.has(id)) {
      throw new Error('Template ID collision occurred')
    }
    const now = new Date().toISOString()
    const template: RecordingTemplate = {
      ...input,
      id,
      category: 'custom',
      createdAt: now,
      updatedAt: now
    }
    this.validateTemplate(template)
    await this.saveTemplate(template)
    this.templates.set(id, template)
    return template
  }

  public async updateTemplate(
    id: string,
    updates: Partial<RecordingTemplate>
  ): Promise<RecordingTemplate> {
    await this.initialize()
    const existing = this.templates.get(id)
    if (!existing) throw new Error('Template not found')
    if (existing.category === 'built-in') throw new Error('Cannot modify built-in templates')
    const updated: RecordingTemplate = {
      ...existing,
      ...updates,
      id,
      category: 'custom',
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString()
    }
    this.validateTemplate(updated)
    await this.saveTemplate(updated)
    this.templates.set(id, updated)
    return updated
  }

  public async deleteTemplate(id: string): Promise<void> {
    await this.initialize()
    const existing = this.templates.get(id)
    if (!existing) throw new Error('Template not found')
    if (existing.category === 'built-in') throw new Error('Cannot delete built-in templates')
    await fs.unlink(path.join(this.customPath, `${id}.json`))
    this.templates.delete(id)
  }

  public async exportTemplate(id: string): Promise<string> {
    const template = await this.getTemplate(id)
    if (!template) throw new Error('Template not found')
    return JSON.stringify(template, null, 2)
  }

  private async loadBuiltInTemplates(): Promise<void> {
    try {
      const files = await fs.readdir(this.builtInPath)
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        const content = await fs.readFile(path.join(this.builtInPath, file), 'utf-8')
        const template = JSON.parse(content) as RecordingTemplate
        template.category = 'built-in'
        this.validateTemplate(template)
        this.templates.set(template.id, template)
      }
    } catch {
      // built-in templates can be absent in tests
    }
  }

  private async loadCustomTemplates(): Promise<void> {
    await fs.mkdir(this.customPath, { recursive: true })
    const files = await fs.readdir(this.customPath)
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const content = await fs.readFile(path.join(this.customPath, file), 'utf-8')
      const template = JSON.parse(content) as RecordingTemplate
      template.category = 'custom'
      this.validateTemplate(template)
      this.templates.set(template.id, template)
    }
  }

  private async saveTemplate(template: RecordingTemplate): Promise<void> {
    await fs.mkdir(this.customPath, { recursive: true })
    await fs.writeFile(
      path.join(this.customPath, `${template.id}.json`),
      JSON.stringify(template, null, 2),
      'utf-8'
    )
  }

  private validateTemplate(template: RecordingTemplate): void {
    if (!template.id || !template.name.trim()) throw new Error('Template must have id and name')
    if (!template.description.trim()) throw new Error('Template description is required')
    if (!template.prompts?.summary?.trim()) throw new Error('Template summary prompt is required')
    if (template.prompts.customFields && template.prompts.customFields.length > 10) {
      throw new Error('Custom fields are limited to 10')
    }
  }

  private generateId(name: string): string {
    return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`
  }
}
