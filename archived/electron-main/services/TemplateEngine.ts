import Handlebars from 'handlebars'

export interface TemplateData {
  title: string
  date: string
  duration: number
  summary?: string
  actionItems?: Array<{ task: string; assignee?: string; deadline?: string }>
  discussionPoints?: string[]
  decisions?: string[]
  transcript: Array<{ speaker?: string; text: string; timestamp: number }>
  tags?: string[]
  category?: string
  relatedRecordings?: Array<{ title: string; link: string }>
  audioPath?: string
}

type TemplateDelegate = Handlebars.TemplateDelegate<TemplateData>

export class TemplateEngine {
  private readonly templates = new Map<string, TemplateDelegate>()

  public constructor() {
    this.registerHelpers()
  }

  public loadTemplate(name: string, template: string): void {
    this.templates.set(name, Handlebars.compile(template))
  }

  public listTemplates(): string[] {
    return Array.from(this.templates.keys()).sort()
  }

  public hasTemplate(name: string): boolean {
    return this.templates.has(name)
  }

  public render(templateName: string, data: TemplateData): string {
    const template = this.templates.get(templateName)
    if (!template) {
      throw new Error(`Template not found: ${templateName}`)
    }
    return template(data)
  }

  private registerHelpers(): void {
    Handlebars.registerHelper('formatTime', (seconds: number) => {
      const mins = Math.floor(seconds / 60)
      const secs = Math.floor(seconds % 60)
      return `${mins}:${secs.toString().padStart(2, '0')}`
    })

    Handlebars.registerHelper('formatDuration', (seconds: number) => {
      const hours = Math.floor(seconds / 3600)
      const mins = Math.floor((seconds % 3600) / 60)
      const secs = Math.floor(seconds % 60)
      if (hours > 0) return `${hours}h ${mins}m`
      if (mins > 0) return `${mins}m ${secs}s`
      return `${secs}s`
    })

    Handlebars.registerHelper('formatDate', (date: string) => {
      return new Date(date).toISOString().split('T')[0]
    })

    Handlebars.registerHelper('wikilink', (title: string) => {
      return `[[${title}]]`
    })
  }
}
