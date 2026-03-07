import { describe, expect, it } from 'vitest'
import { formatDate, formatDuration, formatFileSize } from '../../src/renderer/src/lib/format'

describe('format utilities', () => {
  it('formats duration by locale number formatting', () => {
    expect(formatDuration(65, 'en')).toBe('1:05')
    expect(formatDuration(3661, 'en')).toBe('1:01:01')
  })

  it('formats file size with unit', () => {
    expect(formatFileSize(1024, 'en')).toContain('KB')
    expect(formatFileSize(1536, 'en')).toContain('KB')
  })

  it('formats date to non-empty localized string', () => {
    const out = formatDate('2026-03-04T12:34:00.000Z', 'en')
    expect(out.length).toBeGreaterThan(0)
  })
})
