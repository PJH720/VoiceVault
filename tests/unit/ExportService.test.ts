import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseService } from '../../src/main/services/DatabaseService'
import { ExportService } from '../../src/main/services/ExportService'
import type { ExportOptions } from '../../src/shared/types'

vi.mock('electron', () => {
  return {
    app: {
      getPath: (name: string) => {
        if (name === 'userData') return process.env.VV_TEST_USER_DATA ?? os.tmpdir()
        return os.tmpdir()
      },
      getAppPath: () => process.env.VV_TEST_APP_PATH ?? process.cwd()
    }
  }
})

describe('ExportService', () => {
  let tmpDir = ''
  let appDir = ''
  let vaultDir = ''
  let service: DatabaseService

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicevault-export-test-'))
    appDir = path.join(tmpDir, 'app')
    vaultDir = path.join(tmpDir, 'vault')
    process.env.VV_TEST_USER_DATA = tmpDir
    process.env.VV_TEST_APP_PATH = appDir
    fs.mkdirSync(path.join(appDir, 'resources', 'templates', 'obsidian'), { recursive: true })
    fs.mkdirSync(vaultDir, { recursive: true })
    fs.writeFileSync(
      path.join(appDir, 'resources', 'templates', 'obsidian', 'basic.md'),
      '# {{title}}\n\n{{summary}}\n\n{{#each transcript}}- {{text}}\n{{/each}}\n{{audioPath}}',
      'utf-8'
    )
    service = new DatabaseService()
  })

  afterEach(() => {
    service.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.VV_TEST_USER_DATA
    delete process.env.VV_TEST_APP_PATH
  })

  it('exports markdown with frontmatter and resolves filename collisions', async () => {
    const audioPath = path.join(tmpDir, 'sample.wav')
    fs.writeFileSync(audioPath, 'audio-data', 'utf-8')
    const recordingId = service.insertRecording({
      title: 'Weekly Sync',
      duration: 120,
      audioPath,
      fileSizeBytes: 10,
      tags: ['meeting'],
      category: 'team'
    })
    service.insertTranscriptSegments(recordingId, [
      { text: 'first line', start: 0, end: 1, language: 'en', confidence: 0.9 }
    ])
    service.saveSummary(recordingId, {
      summary: 'summary text',
      actionItems: [],
      discussionPoints: [],
      keyStatements: [],
      decisions: []
    })

    const recording = service.getRecordingWithTranscript(recordingId)
    if (!recording) throw new Error('recording not found')

    const exportService = new ExportService(service)
    const options: ExportOptions = {
      templateName: 'basic',
      vaultPath: vaultDir,
      folderStructure: 'flat',
      includeAudio: true,
      audioAsAttachment: true,
      generateWikilinks: true
    }
    const first = await exportService.exportRecording(
      { ...recording, summary: service.getLatestSummary(recordingId)?.output },
      options
    )
    const second = await exportService.exportRecording(
      { ...recording, summary: service.getLatestSummary(recordingId)?.output },
      options
    )

    expect(fs.existsSync(first.path)).toBe(true)
    expect(fs.existsSync(second.path)).toBe(true)
    expect(first.path).not.toBe(second.path)
    expect(first.content).toContain('---')
    expect(first.content).toContain('# Weekly Sync')
  })
})
