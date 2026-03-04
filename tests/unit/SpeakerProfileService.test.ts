import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseService } from '../../src/main/services/DatabaseService'
import { SpeakerProfileService } from '../../src/main/services/SpeakerProfileService'

vi.mock('electron', () => {
  return {
    app: {
      getPath: () => process.env.VV_TEST_USER_DATA ?? os.tmpdir()
    }
  }
})

describe('SpeakerProfileService', () => {
  let tmpDir = ''
  let db: DatabaseService
  let service: SpeakerProfileService

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicevault-speaker-profile-test-'))
    process.env.VV_TEST_USER_DATA = tmpDir
    db = new DatabaseService()
    service = new SpeakerProfileService(db)
  })

  afterEach(() => {
    db.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.VV_TEST_USER_DATA
  })

  it('creates and updates speaker profile', () => {
    const created = service.createProfile('Alice')
    expect(created.id).toBeGreaterThan(0)
    expect(created.name).toBe('Alice')

    const updated = service.updateProfile(created.id, { name: 'Alice Kim' })
    expect(updated?.name).toBe('Alice Kim')
  })

  it('merges speaker profiles', () => {
    const source = service.createProfile('Speaker A')
    const target = service.createProfile('Speaker B')
    const merged = service.mergeProfiles(source.id, target.id)
    expect(merged).toBe(true)

    const profiles = service.listProfiles()
    expect(profiles.some((profile) => profile.id === source.id)).toBe(false)
    expect(profiles.some((profile) => profile.id === target.id)).toBe(true)
  })
})
