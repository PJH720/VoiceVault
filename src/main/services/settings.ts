import { Database } from 'bun:sqlite'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { getUserDataPath } from '../types'
import type {
  CloudModelName,
  LlmModelName,
  SupportedLocale,
  UsageStats,
  WhisperModelSize
} from '../../shared/types'

let _settingsDb: Database | null = null

const defaults: Record<string, unknown> = {
  locale: 'ko',
  whisperModel: 'base',
  llmModel: 'gemma-2-3n-instruct-q4_k_m',
  preferredLlmProvider: 'local',
  cloudModel: 'claude-sonnet-4-5-20250514',
  localOnlyMode: false,
  usageStats: JSON.stringify({
    totalCost: 0,
    totalRequests: 0,
    lastReset: new Date().toISOString()
  }),
  translationTargetLanguage: 'en'
}

function ensureDb(): Database {
  if (_settingsDb) return _settingsDb

  const dbPath = join(getUserDataPath(), 'settings.db')
  mkdirSync(join(dbPath, '..'), { recursive: true })

  _settingsDb = new Database(dbPath)
  _settingsDb.exec('PRAGMA journal_mode = WAL')
  _settingsDb.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `)

  return _settingsDb
}

export function get<T>(key: string, defaultValue?: T): T {
  const db = ensureDb()
  const row = db.query<{ value: string }, [string]>('SELECT value FROM settings WHERE key = ?').get(key)
  if (!row) {
    const fallback = defaultValue ?? defaults[key]
    return (typeof fallback === 'string' ? tryParseJson(fallback) : fallback) as T
  }
  return tryParseJson(row.value) as T
}

export function set(key: string, value: unknown): void {
  const db = ensureDb()
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  db.query('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, serialized)
}

export function del(key: string): void {
  const db = ensureDb()
  db.query('DELETE FROM settings WHERE key = ?').run(key)
}

export function getAll(): Record<string, unknown> {
  const db = ensureDb()
  const rows = db.query<{ key: string; value: string }, []>('SELECT key, value FROM settings').all()
  const result: Record<string, unknown> = { ...defaults }
  for (const row of rows) {
    result[row.key] = tryParseJson(row.value)
  }
  return result
}

export function closeSettings(): void {
  _settingsDb?.close()
  _settingsDb = null
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

// Typed accessors matching src/main/store.ts

export function getLocale(): SupportedLocale {
  const value = get<string>('locale', 'ko')
  const valid: SupportedLocale[] = ['ko', 'en', 'ja']
  return valid.includes(value as SupportedLocale) ? (value as SupportedLocale) : 'ko'
}

export function setLocale(locale: SupportedLocale): SupportedLocale {
  set('locale', locale)
  return locale
}

export function getWhisperModel(): WhisperModelSize {
  const value = get<string>('whisperModel', 'base')
  const valid: WhisperModelSize[] = ['base', 'small', 'medium', 'large-v3-turbo']
  return valid.includes(value as WhisperModelSize) ? (value as WhisperModelSize) : 'base'
}

export function setWhisperModel(model: WhisperModelSize): WhisperModelSize {
  set('whisperModel', model)
  return model
}

export function getLlmModel(): LlmModelName {
  const value = get<string>('llmModel', 'gemma-2-3n-instruct-q4_k_m')
  const valid: LlmModelName[] = ['gemma-2-3n-instruct-q4_k_m', 'llama-3.2-3b-instruct-q4_k_m']
  return valid.includes(value as LlmModelName) ? (value as LlmModelName) : 'gemma-2-3n-instruct-q4_k_m'
}

export function setLlmModel(model: LlmModelName): LlmModelName {
  set('llmModel', model)
  return model
}

export function getAnthropicApiKey(): string | null {
  return get<string | null>('anthropicApiKey', null)
}

export function setAnthropicApiKey(key: string): void {
  if (!key) {
    del('anthropicApiKey')
    return
  }
  set('anthropicApiKey', key)
}

export function getOpenAIApiKey(): string | null {
  return get<string | null>('openaiApiKey', null)
}

export function setOpenAIApiKey(key: string): void {
  if (!key) {
    del('openaiApiKey')
    return
  }
  set('openaiApiKey', key)
}

export function getGeminiApiKey(): string | null {
  return get<string | null>('geminiApiKey', null)
}

export function setGeminiApiKey(key: string): void {
  if (!key) {
    del('geminiApiKey')
    return
  }
  set('geminiApiKey', key)
}

export function maskApiKey(key: string | null): string | null {
  if (!key) return null
  if (key.length < 10) return '***'
  return `${key.slice(0, 7)}...${key.slice(-4)}`
}

export function getPreferredLlmProvider(): 'local' | 'cloud' {
  const value = get<string>('preferredLlmProvider', 'local')
  return value === 'local' || value === 'cloud' ? value : 'local'
}

export function setPreferredLlmProvider(provider: 'local' | 'cloud'): 'local' | 'cloud' {
  set('preferredLlmProvider', provider)
  return provider
}

export function getCloudModel(): CloudModelName {
  return get<CloudModelName>('cloudModel', 'claude-sonnet-4-5-20250514')
}

export function setCloudModel(model: CloudModelName): CloudModelName {
  set('cloudModel', model)
  return model
}

export function getLocalOnlyMode(): boolean {
  return get<boolean>('localOnlyMode', false)
}

export function setLocalOnlyMode(enabled: boolean): boolean {
  set('localOnlyMode', enabled)
  return enabled
}

export function getUsageStats(): UsageStats {
  const value = get<UsageStats>('usageStats')
  if (
    !value ||
    typeof value.totalCost !== 'number' ||
    typeof value.totalRequests !== 'number' ||
    typeof value.lastReset !== 'string'
  ) {
    return { totalCost: 0, totalRequests: 0, lastReset: new Date().toISOString() }
  }
  return value
}

export function addUsage(cost: number): UsageStats {
  const current = getUsageStats()
  const next: UsageStats = {
    totalCost: current.totalCost + Math.max(0, cost),
    totalRequests: current.totalRequests + 1,
    lastReset: current.lastReset
  }
  set('usageStats', next)
  return next
}

export function resetUsageStats(): UsageStats {
  const next: UsageStats = {
    totalCost: 0,
    totalRequests: 0,
    lastReset: new Date().toISOString()
  }
  set('usageStats', next)
  return next
}

export function getObsidianVaultPath(): string | null {
  return get<string | null>('obsidianVaultPath', null)
}

export function setObsidianVaultPath(path: string): string {
  set('obsidianVaultPath', path)
  return path
}

export function getTranslationTargetLanguage(): string {
  const value = get<string>('translationTargetLanguage', 'en')
  return typeof value === 'string' && value.length >= 2 && value.length <= 5 ? value : 'en'
}

export function setTranslationTargetLanguage(language: string): string {
  set('translationTargetLanguage', language)
  return language
}
