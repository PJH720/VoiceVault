import { safeStorage } from 'electron'
import type { CloudModelName, LlmModelName, SupportedLocale, UsageStats, WhisperModelSize } from '../shared/types'

type StoreShape = {
  locale: SupportedLocale
  whisperModel: WhisperModelSize
  llmModel: LlmModelName
  anthropicApiKey?: string
  preferredLlmProvider: 'local' | 'cloud'
  cloudModel: CloudModelName
  localOnlyMode: boolean
  usageStats: UsageStats
  obsidianVaultPath?: string
  translationTargetLanguage: string
}

type StoreInstance = {
  get<K extends keyof StoreShape>(key: K): StoreShape[K]
  set<K extends keyof StoreShape>(key: K, value: StoreShape[K]): void
  delete(key: keyof StoreShape): void
}

let store: StoreInstance

const defaults: StoreShape = {
  locale: 'ko',
  whisperModel: 'base',
  llmModel: 'gemma-2-3n-instruct-q4_k_m',
  preferredLlmProvider: 'local',
  cloudModel: 'claude-3-5-sonnet-20241022',
  localOnlyMode: false,
  usageStats: {
    totalCost: 0,
    totalRequests: 0,
    lastReset: new Date().toISOString()
  },
  translationTargetLanguage: 'en'
}

export async function initStore(): Promise<void> {
  // electron-store v11+ is ESM-only; use dynamic import for CJS compat
  const mod = await import('electron-store')
  const Store = mod.default ?? mod
  store = new (Store as unknown as new (opts: { defaults: StoreShape }) => StoreInstance)({ defaults })
}

function ensureStore(): StoreInstance {
  if (!store) throw new Error('Store not initialized — call initStore() first')
  return store
}

export function getLocale(): SupportedLocale {
  return ensureStore().get('locale')
}

export function setLocale(locale: SupportedLocale): SupportedLocale {
  ensureStore().set('locale', locale)
  return locale
}

export function getWhisperModel(): WhisperModelSize {
  return ensureStore().get('whisperModel')
}

export function setWhisperModel(model: WhisperModelSize): WhisperModelSize {
  ensureStore().set('whisperModel', model)
  return model
}

export function getLlmModel(): LlmModelName {
  return ensureStore().get('llmModel')
}

export function setLlmModel(model: LlmModelName): LlmModelName {
  ensureStore().set('llmModel', model)
  return model
}

export function setAnthropicApiKey(key: string): void {
  if (!key) {
    ensureStore().delete('anthropicApiKey')
    return
  }
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(key)
    ensureStore().set('anthropicApiKey', encrypted.toString('base64'))
    return
  }
  ensureStore().set('anthropicApiKey', key)
}

export function getAnthropicApiKey(): string | null {
  const raw = store.get('anthropicApiKey')
  if (!raw) return null
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(raw, 'base64'))
    } catch {
      return null
    }
  }
  return raw
}

export function maskApiKey(key: string | null): string | null {
  if (!key) return null
  if (key.length < 10) return '***'
  return `${key.slice(0, 7)}...${key.slice(-4)}`
}

export function getPreferredLlmProvider(): 'local' | 'cloud' {
  return ensureStore().get('preferredLlmProvider')
}

export function setPreferredLlmProvider(provider: 'local' | 'cloud'): 'local' | 'cloud' {
  ensureStore().set('preferredLlmProvider', provider)
  return provider
}

export function getCloudModel(): CloudModelName {
  return ensureStore().get('cloudModel')
}

export function setCloudModel(model: CloudModelName): CloudModelName {
  ensureStore().set('cloudModel', model)
  return model
}

export function getLocalOnlyMode(): boolean {
  return ensureStore().get('localOnlyMode')
}

export function setLocalOnlyMode(enabled: boolean): boolean {
  ensureStore().set('localOnlyMode', enabled)
  return enabled
}

export function getUsageStats(): UsageStats {
  return ensureStore().get('usageStats')
}

export function addUsage(cost: number): UsageStats {
  const current = getUsageStats()
  const next: UsageStats = {
    totalCost: current.totalCost + Math.max(0, cost),
    totalRequests: current.totalRequests + 1,
    lastReset: current.lastReset
  }
  ensureStore().set('usageStats', next)
  return next
}

export function resetUsageStats(): UsageStats {
  const next: UsageStats = {
    totalCost: 0,
    totalRequests: 0,
    lastReset: new Date().toISOString()
  }
  ensureStore().set('usageStats', next)
  return next
}

export function getObsidianVaultPath(): string | null {
  return ensureStore().get('obsidianVaultPath') ?? null
}

export function setObsidianVaultPath(path: string): string {
  ensureStore().set('obsidianVaultPath', path)
  return path
}

export function getTranslationTargetLanguage(): string {
  return ensureStore().get('translationTargetLanguage')
}

export function setTranslationTargetLanguage(language: string): string {
  ensureStore().set('translationTargetLanguage', language)
  return language
}
