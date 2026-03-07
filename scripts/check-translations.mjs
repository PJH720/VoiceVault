/* eslint-disable @typescript-eslint/explicit-function-return-type */
import en from '../src/renderer/src/i18n/locales/en.json' with { type: 'json' }
import ko from '../src/renderer/src/i18n/locales/ko.json' with { type: 'json' }
import ja from '../src/renderer/src/i18n/locales/ja.json' with { type: 'json' }

function getKeys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return getKeys(value, `${prefix}${key}.`)
    }
    return [`${prefix}${key}`]
  })
}

function getByPath(obj, keyPath) {
  return keyPath.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj)
}

function extractPlaceholders(value) {
  if (typeof value !== 'string') return new Set()
  const matches = value.match(/{{\s*[\w.]+\s*}}/g) ?? []
  return new Set(matches.map((item) => item.replace(/\s+/g, '')))
}

const baseKeys = new Set(getKeys(en))
const targets = [
  ['ko', ko],
  ['ja', ja]
]

let hasError = false
const trayRequiredKeys = ['tray.open', 'tray.quit', 'tray.tooltip']

for (const [name, locale] of targets) {
  const localeKeys = new Set(getKeys(locale))
  const missing = [...baseKeys].filter((key) => !localeKeys.has(key))
  const trayMissing = trayRequiredKeys.filter((key) => !localeKeys.has(key))
  const typeMismatches = []
  const placeholderMismatches = []

  for (const key of baseKeys) {
    if (!localeKeys.has(key)) continue
    const baseValue = getByPath(en, key)
    const localeValue = getByPath(locale, key)
    if (typeof baseValue !== typeof localeValue) {
      typeMismatches.push(key)
      continue
    }
    if (typeof baseValue === 'string' && typeof localeValue === 'string') {
      const baseTokens = extractPlaceholders(baseValue)
      const localeTokens = extractPlaceholders(localeValue)
      const sameCount = baseTokens.size === localeTokens.size
      const sameValues = [...baseTokens].every((token) => localeTokens.has(token))
      if (!sameCount || !sameValues) {
        placeholderMismatches.push(key)
      }
    }
  }

  if (missing.length > 0) {
    hasError = true
    console.error(`${name}: missing ${missing.length} keys`)
    for (const key of missing) {
      console.error(`  - ${key}`)
    }
  }
  if (trayMissing.length > 0) {
    hasError = true
    console.error(`${name}: missing tray translation keys (${trayMissing.length})`)
    for (const key of trayMissing) {
      console.error(`  - ${key}`)
    }
  }
  if (typeMismatches.length > 0) {
    hasError = true
    console.error(`${name}: type mismatch ${typeMismatches.length} keys`)
    for (const key of typeMismatches) {
      console.error(`  - ${key}`)
    }
  }
  if (placeholderMismatches.length > 0) {
    hasError = true
    console.error(`${name}: placeholder mismatch ${placeholderMismatches.length} keys`)
    for (const key of placeholderMismatches) {
      console.error(`  - ${key}`)
    }
  }
}

if (hasError) {
  process.exit(1)
}
console.log('All translation keys, placeholders, and structures are valid.')
