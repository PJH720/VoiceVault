import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TemplateManager } from '../../src/main/services/TemplateManager'

vi.mock('electron', () => {
  return {
    app: {
      getPath: () => process.env.VV_TEST_USER_DATA ?? os.tmpdir(),
      getAppPath: () => process.env.VV_TEST_APP_PATH ?? process.cwd()
    }
  }
})

describe('TemplateManager', () => {
  let tmpDir = ''
  let appDir = ''

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicevault-template-manager-test-'))
    appDir = path.join(tmpDir, 'app')
    process.env.VV_TEST_USER_DATA = tmpDir
    process.env.VV_TEST_APP_PATH = appDir
    fs.mkdirSync(path.join(appDir, 'resources', 'templates', 'classification'), { recursive: true })
    fs.writeFileSync(
      path.join(appDir, 'resources', 'templates', 'classification', 'meeting.json'),
      JSON.stringify({
        id: 'meeting',
        name: 'Meeting',
        description: 'Meeting template',
        icon: '👥',
        color: '#3b82f6',
        category: 'built-in',
        keywords: ['meeting'],
        prompts: { summary: 'Summarize this meeting.' },
        createdAt: '2026-03-04T00:00:00.000Z',
        updatedAt: '2026-03-04T00:00:00.000Z'
      }),
      'utf-8'
    )
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.VV_TEST_USER_DATA
    delete process.env.VV_TEST_APP_PATH
  })

  it('loads built-in and manages custom templates', async () => {
    const manager = new TemplateManager()
    const builtIns = await manager.listTemplates()
    expect(builtIns.some((template) => template.id === 'meeting')).toBe(true)

    const created = await manager.createTemplate({
      name: 'My Custom',
      description: 'Custom template',
      icon: '📄',
      color: '#111827',
      keywords: ['custom'],
      prompts: { summary: 'Summarize custom note.' }
    })
    expect(created.category).toBe('custom')

    const updated = await manager.updateTemplate(created.id, { description: 'Updated description' })
    expect(updated.description).toBe('Updated description')

    await manager.deleteTemplate(created.id)
    const remaining = await manager.listTemplates()
    expect(remaining.some((template) => template.id === created.id)).toBe(false)
  })
})
