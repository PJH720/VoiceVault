import Store from 'electron-store'
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

const store = new Store<StoreShape>({
  defaults: {
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
})

export function getLocale(): SupportedLocale {
  return store.get('locale')
}

export function setLocale(locale: SupportedLocale): SupportedLocale {
  store.set('locale', locale)
  return locale
}

export function getWhisperModel(): WhisperModelSize {
  return store.get('whisperModel')
}

export function setWhisperModel(model: WhisperModelSize): WhisperModelSize {
  store.set('whisperModel', model)
  return model
}

export function getLlmModel(): LlmModelName {
  return store.get('llmModel')
}

export function setLlmModel(model: LlmModelName): LlmModelName {
  store.set('llmModel', model)
  return model
}

export function setAnthropicApiKey(key: string): void {
  if (!key) {
    store.delete('anthropicApiKey')
    return
  }
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(key)
    store.set('anthropicApiKey', encrypted.toString('base64'))
    return
  }
  store.set('anthropicApiKey', key)
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
  return store.get('preferredLlmProvider')
}

export function setPreferredLlmProvider(provider: 'local' | 'cloud'): 'local' | 'cloud' {
  store.set('preferredLlmProvider', provider)
  return provider
}

export function getCloudModel(): CloudModelName {
  return store.get('cloudModel')
}

export function setCloudModel(model: CloudModelName): CloudModelName {
  store.set('cloudModel', model)
  return model
}

export function getLocalOnlyMode(): boolean {
  return store.get('localOnlyMode')
}

export function setLocalOnlyMode(enabled: boolean): boolean {
  store.set('localOnlyMode', enabled)
  return enabled
}

export function getUsageStats(): UsageStats {
  return store.get('usageStats')
}

export function addUsage(cost: number): UsageStats {
  const current = getUsageStats()
  const next: UsageStats = {
    totalCost: current.totalCost + Math.max(0, cost),
    totalRequests: current.totalRequests + 1,
    lastReset: current.lastReset
  }
  store.set('usageStats', next)
  return next
}

export function resetUsageStats(): UsageStats {
  const next: UsageStats = {
    totalCost: 0,
    totalRequests: 0,
    lastReset: new Date().toISOString()
  }
  store.set('usageStats', next)
  return next
}

export function getObsidianVaultPath(): string | null {
  return store.get('obsidianVaultPath') ?? null
}

export function setObsidianVaultPath(path: string): string {
  store.set('obsidianVaultPath', path)
  return path
}

export function getTranslationTargetLanguage(): string {
  return store.get('translationTargetLanguage')
}

export function setTranslationTargetLanguage(language: string): string {
  store.set('translationTargetLanguage', language)
  return language
}
