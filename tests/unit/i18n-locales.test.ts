import { describe, expect, it } from 'vitest'
import en from '../../src/renderer/src/i18n/locales/en.json'
import ko from '../../src/renderer/src/i18n/locales/ko.json'
import ja from '../../src/renderer/src/i18n/locales/ja.json'

function flattenKeys(obj: unknown, prefix = ''): string[] {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return []
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) => {
    const next = `${prefix}${key}`
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return flattenKeys(value, `${next}.`)
    }
    return [next]
  })
}

describe('i18n locale completeness', () => {
  it('ko and ja include all en keys', () => {
    const base = new Set(flattenKeys(en))
    const koKeys = new Set(flattenKeys(ko))
    const jaKeys = new Set(flattenKeys(ja))
    const missingKo = [...base].filter((key) => !koKeys.has(key))
    const missingJa = [...base].filter((key) => !jaKeys.has(key))
    expect(missingKo).toEqual([])
    expect(missingJa).toEqual([])
  })
})
