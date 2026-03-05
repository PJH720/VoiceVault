import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportService } from '../../src/main/services/ExportService'
import type { RecordingWithTranscript, ExportOptions } from '../../src/shared/types'

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return process.env.VV_TEST_USER_DATA ?? os.tmpdir()
      return os.tmpdir()
    },
    getAppPath: () => process.env.VV_TEST_APP_PATH ?? process.cwd()
  }
}))

const makeRecording = (
  overrides: Partial<RecordingWithTranscript> = {}
): RecordingWithTranscript => ({
  id: 1,
  title: 'Test Recording',
  createdAt: '2026-03-05T10:00:00.000Z',
  updatedAt: '2026-03-05T10:00:00.000Z',
  duration: 300,
  audioPath: '/tmp/test.wav',
  tags: ['test', 'demo'],
  category: 'meeting',
  isBookmarked: false,
  isArchived: false,
  fileSizeBytes: 1024,
  templateId: 'basic',
  classificationConfidence: 0.9,
  segments: [
    {
      text: 'Hello world',
      start: 0,
      end: 2,
      language: 'en',
      confidence: 0.95,
      speakerName: 'Alice'
    },
    { text: 'How are you?', start: 2, end: 4, language: 'en', confidence: 0.9, speakerName: 'Bob' }
  ],
  summary: {
    summary: 'A test conversation.',
    actionItems: [{ task: 'Follow up', priority: 'high' }],
    discussionPoints: ['Greetings'],
    keyStatements: [{ text: 'Hello world', timestamp: 0 }],
    decisions: ['Proceed with demo']
  },
  ...overrides
})

describe('ExportService — extended', () => {
  let tmpDir: string
  let appDir: string
  let vaultDir: string
  let mockDb: Record<string, (...args: unknown[]) => unknown>

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-export-ext-'))
    appDir = path.join(tmpDir, 'app')
    vaultDir = path.join(tmpDir, 'vault')
    process.env.VV_TEST_USER_DATA = tmpDir
    process.env.VV_TEST_APP_PATH = appDir

    fs.mkdirSync(path.join(appDir, 'resources', 'templates', 'obsidian'), { recursive: true })
    fs.mkdirSync(vaultDir, { recursive: true })

    // Template with wikilinks helper
    fs.writeFileSync(
      path.join(appDir, 'resources', 'templates', 'obsidian', 'meeting-notes.md'),
      '# {{title}}\n\n## Summary\n{{summary}}\n\n## Action Items\n{{#each actionItems}}- [ ] {{task}}\n{{/each}}\n\n## Transcript\n{{#each transcript}}[{{formatTime timestamp}}] **{{speaker}}**: {{text}}\n{{/each}}\n\n## Related\n{{#each relatedRecordings}}- {{link}}\n{{/each}}',
      'utf-8'
    )
    fs.writeFileSync(
      path.join(appDir, 'resources', 'templates', 'obsidian', 'basic.md'),
      '# {{title}}\n\n{{summary}}\n\n{{audioPath}}',
      'utf-8'
    )

    mockDb = {
      getRecordingWithTranscript: () => null,
      getLatestSummary: () => null,
      listRecordings: () => []
    }
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.VV_TEST_USER_DATA
    delete process.env.VV_TEST_APP_PATH
  })

  it('generates frontmatter with all expected fields', async () => {
    const exportService = new ExportService(mockDb as never)
    const recording = makeRecording()
    const options: ExportOptions = {
      templateName: 'basic',
      vaultPath: vaultDir,
      folderStructure: 'flat',
      includeAudio: false,
      audioAsAttachment: false,
      generateWikilinks: true
    }
    const result = await exportService.exportRecording(recording, options)
    expect(result.content).toContain('---')
    expect(result.content).toContain('title: "Test Recording"')
    expect(result.content).toContain('date: 2026-03-05')
    expect(result.content).toContain('duration: 300')
    expect(result.content).toContain('category: "meeting"')
    expect(result.content).toContain('has_summary: true')
    expect(result.content).toContain('wikilinks: true')
    expect(result.content).toContain('- "test"')
    expect(result.content).toContain('- "demo"')
  })

  it('includes speakers in frontmatter', async () => {
    const exportService = new ExportService(mockDb as never)
    const recording = makeRecording()
    const result = await exportService.exportRecording(recording, {
      templateName: 'basic',
      vaultPath: vaultDir,
      folderStructure: 'flat',
      includeAudio: false,
      audioAsAttachment: false,
      generateWikilinks: false
    })
    expect(result.content).toContain('speakers:')
    expect(result.content).toContain('- "Alice"')
    expect(result.content).toContain('- "Bob"')
  })

  it('renders template with action items and transcript', async () => {
    const exportService = new ExportService(mockDb as never)
    const recording = makeRecording()
    const result = await exportService.exportRecording(recording, {
      templateName: 'meeting-notes',
      vaultPath: vaultDir,
      folderStructure: 'flat',
      includeAudio: false,
      audioAsAttachment: false,
      generateWikilinks: false
    })
    expect(result.content).toContain('# Test Recording')
    expect(result.content).toContain('- [ ] Follow up')
    expect(result.content).toContain('**Alice**')
    expect(result.content).toContain('Hello world')
  })

  it('creates by-date folder structure', async () => {
    const exportService = new ExportService(mockDb as never)
    const recording = makeRecording()
    const result = await exportService.exportRecording(recording, {
      templateName: 'basic',
      vaultPath: vaultDir,
      folderStructure: 'by-date',
      includeAudio: false,
      audioAsAttachment: false,
      generateWikilinks: false
    })
    expect(result.path).toContain('2026')
    expect(result.path).toContain('2026-03')
  })

  it('creates by-category folder structure', async () => {
    const exportService = new ExportService(mockDb as never)
    const recording = makeRecording()
    const result = await exportService.exportRecording(recording, {
      templateName: 'basic',
      vaultPath: vaultDir,
      folderStructure: 'by-category',
      includeAudio: false,
      audioAsAttachment: false,
      generateWikilinks: false
    })
    expect(result.path).toContain('meeting')
  })

  it('generates wikilink-style audio attachment', async () => {
    const audioPath = path.join(tmpDir, 'test.wav')
    fs.writeFileSync(audioPath, 'audio')
    const exportService = new ExportService(mockDb as never)
    const recording = makeRecording({ audioPath })
    const result = await exportService.exportRecording(recording, {
      templateName: 'basic',
      vaultPath: vaultDir,
      folderStructure: 'flat',
      includeAudio: true,
      audioAsAttachment: true,
      generateWikilinks: false
    })
    expect(result.content).toContain('![[attachments/')
  })
})
