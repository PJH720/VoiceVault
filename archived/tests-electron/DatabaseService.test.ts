import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { DatabaseService } from '../../src/main/services/DatabaseService'

vi.mock('electron', () => {
  return {
    app: {
      getPath: () => process.env.VV_TEST_USER_DATA ?? os.tmpdir()
    }
  }
})

describe('DatabaseService', () => {
  let tmpDir = ''
  let service: DatabaseService

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicevault-db-test-'))
    process.env.VV_TEST_USER_DATA = tmpDir
    service = new DatabaseService()
  })

  afterEach(() => {
    service.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.VV_TEST_USER_DATA
  })

  it('inserts and lists recordings', () => {
    const id = service.insertRecording({
      title: 'Test Recording',
      duration: 12.5,
      audioPath: '/tmp/test.wav',
      fileSizeBytes: 512
    })

    expect(id).toBeGreaterThan(0)
    const list = service.listRecordings()
    expect(list).toHaveLength(1)
    expect(list[0].title).toBe('Test Recording')
    expect(list[0].audioPath).toBe('/tmp/test.wav')
    expect(list[0].tags).toEqual([])
    expect(list[0].isArchived).toBe(false)
  })

  it('updates and soft deletes recordings', () => {
    const id = service.insertRecording({
      title: 'Old Title',
      duration: 3,
      audioPath: '/tmp/old.wav',
      fileSizeBytes: 256
    })

    const updated = service.updateRecording(id, {
      title: 'New Title',
      isBookmarked: true,
      tags: ['meeting']
    })
    expect(updated?.title).toBe('New Title')
    expect(updated?.isBookmarked).toBe(true)
    expect(updated?.tags).toEqual(['meeting'])

    const deleted = service.deleteRecording(id, false)
    expect(deleted?.id).toBe(id)
    expect(service.getRecording(id)).toBeNull()
  })

  it('stores and lists transcript segments', () => {
    const id = service.insertRecording({
      title: 'Transcript source',
      duration: 10,
      audioPath: '/tmp/t.wav',
      fileSizeBytes: 1024
    })

    const inserted = service.insertTranscriptSegments(id, [
      {
        text: 'hello',
        start: 0.1,
        end: 1.2,
        language: 'en',
        confidence: 0.91
      },
      {
        text: 'world',
        start: 1.3,
        end: 2.1,
        language: 'en',
        confidence: 0.88,
        words: [{ word: 'world', start: 1.3, end: 2.1 }]
      }
    ])

    expect(inserted).toBe(2)
    const segments = service.listTranscriptSegments(id)
    expect(segments).toHaveLength(2)
    expect(segments[0].text).toBe('hello')
    expect(segments[1].words?.[0].word).toBe('world')
  })

  it('searches recordings by transcript text with FTS', () => {
    const firstId = service.insertRecording({
      title: 'Alpha',
      duration: 4,
      audioPath: '/tmp/a.wav',
      fileSizeBytes: 100
    })
    const secondId = service.insertRecording({
      title: 'Beta',
      duration: 4,
      audioPath: '/tmp/b.wav',
      fileSizeBytes: 100
    })
    service.insertTranscriptSegments(firstId, [
      { text: 'project roadmap', start: 0, end: 1, language: 'en', confidence: 0.9 }
    ])
    service.insertTranscriptSegments(secondId, [
      { text: 'random note', start: 0, end: 1, language: 'en', confidence: 0.9 }
    ])

    const results = service.searchRecordings('roadmap')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe(firstId)
  })

  it('searches with FTS5 special characters without throwing', () => {
    const id = service.insertRecording({
      title: 'Special chars',
      duration: 5,
      audioPath: '/tmp/sc.wav',
      fileSizeBytes: 100
    })
    service.insertTranscriptSegments(id, [
      { text: 'hello world', start: 0, end: 1, language: 'en', confidence: 0.9 }
    ])

    const specialInputs = [
      'hello*',
      'hello "world',
      'AND',
      'OR',
      'NOT',
      'NEAR(a,b)',
      '(test)',
      'a OR b AND c'
    ]
    for (const input of specialInputs) {
      expect(() => service.searchRecordings(input)).not.toThrow()
    }
  })

  it('searches with normal text still returns FTS results', () => {
    const id = service.insertRecording({
      title: 'Normal search',
      duration: 5,
      audioPath: '/tmp/ns.wav',
      fileSizeBytes: 100
    })
    service.insertTranscriptSegments(id, [
      { text: 'quarterly budget review', start: 0, end: 1, language: 'en', confidence: 0.9 }
    ])

    const results = service.searchRecordings('budget')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe(id)
  })

  it('stores and loads latest summary', () => {
    const recordingId = service.insertRecording({
      title: 'Summary source',
      duration: 8,
      audioPath: '/tmp/s.wav',
      fileSizeBytes: 100
    })

    const first = service.saveSummary(recordingId, {
      summary: 'first summary',
      actionItems: [{ task: 'task-1' }],
      discussionPoints: ['point-1'],
      keyStatements: [{ text: 'quote', timestamp: 0 }],
      decisions: ['decision-1']
    })
    const second = service.saveSummary(recordingId, {
      summary: 'second summary',
      actionItems: [],
      discussionPoints: [],
      keyStatements: [],
      decisions: []
    })

    expect(second).toBeGreaterThan(first)
    const latest = service.getLatestSummary(recordingId)
    expect(latest?.output.summary).toBe('second summary')
  })
})
