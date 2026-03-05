import { safeStorage } from 'electron'
import type {
  CloudModelName,
  LlmModelName,
  SupportedLocale,
  UsageStats,
  WhisperModelSize
} from '../shared/types'

type StoreShape = {
  locale: SupportedLocale
  whisperModel: WhisperModelSize
  llmModel: LlmModelName
  anthropicApiKey?: string
  openaiApiKey?: string
  geminiApiKey?: string
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
  cloudModel: 'claude-sonnet-4-5-20250514',
  localOnlyMode: false,
  usageStats: {
    totalCost: 0,
    totalRequests: 0,
    lastReset: new Date().toISOString()
  },
  translationTargetLanguage: 'en'
}

const schema = {
  type: 'object',
  properties: {
    locale: {
      type: 'string',
      enum: ['ko', 'en', 'ja']
    },
    whisperModel: {
      type: 'string',
      enum: ['base', 'small', 'medium', 'large-v3-turbo']
    },
    llmModel: {
      type: 'string',
      enum: ['gemma-2-3n-instruct-q4_k_m', 'llama-3.2-3b-instruct-q4_k_m']
    },
    anthropicApiKey: {
      type: 'string'
    },
    openaiApiKey: {
      type: 'string'
    },
    geminiApiKey: {
      type: 'string'
    },
    preferredLlmProvider: {
      type: 'string',
      enum: ['local', 'cloud']
    },
    cloudModel: {
      type: 'string',
      enum: [
        'claude-sonnet-4-5-20250514',
        'claude-opus-4-6-20250612',
        'claude-haiku-3-5-20241022',
        'claude-3-5-sonnet-20241022',
        'claude-3-opus-20240229',
        'claude-3-haiku-20240307',
        'gpt-4o',
        'gpt-4o-mini',
        'gemini-2.5-flash',
        'gemini-2.5-pro'
      ]
    },
    localOnlyMode: {
      type: 'boolean'
    },
    usageStats: {
      type: 'object',
      properties: {
        totalCost: {
          type: 'number',
          minimum: 0
        },
        totalRequests: {
          type: 'number',
          minimum: 0
        },
        lastReset: {
          type: 'string',
          format: 'date-time'
        }
      },
      required: ['totalCost', 'totalRequests', 'lastReset']
    },
    obsidianVaultPath: {
      type: 'string'
    },
    translationTargetLanguage: {
      type: 'string',
      minLength: 2,
      maxLength: 5
    }
  },
  required: [
    'locale',
    'whisperModel',
    'llmModel',
    'preferredLlmProvider',
    'cloudModel',
    'localOnlyMode',
    'usageStats',
    'translationTargetLanguage'
  ]
} as const

export async function initStore(): Promise<void> {
  // electron-store v11+ is ESM-only; use dynamic import for CJS compat
  const mod = await import('electron-store')
  const Store = mod.default ?? mod
  store = new (Store as unknown as new (opts: {
    defaults: StoreShape
    schema: typeof schema
    migrations: Record<string, (store: StoreInstance) => void>
  }) => StoreInstance)({
    defaults,
    schema,
    migrations: {
      // Example migration for future use
      '>=0.2.0': (store) => {
        // Ensure usageStats has all required fields
        const stats = store.get('usageStats') as Partial<UsageStats> | undefined
        if (!stats || typeof stats.totalCost !== 'number') {
          store.set('usageStats', defaults.usageStats)
        }
      }
    }
  })
}

function ensureStore(): StoreInstance {
  if (!store) throw new Error('Store not initialized — call initStore() first')
  return store
}

export function getLocale(): SupportedLocale {
  const value = ensureStore().get('locale')
  const validLocales: SupportedLocale[] = ['ko', 'en', 'ja']
  return validLocales.includes(value) ? value : defaults.locale
}

export function setLocale(locale: SupportedLocale): SupportedLocale {
  ensureStore().set('locale', locale)
  return locale
}

export function getWhisperModel(): WhisperModelSize {
  const value = ensureStore().get('whisperModel')
  const validModels: WhisperModelSize[] = ['base', 'small', 'medium', 'large-v3-turbo']
  return validModels.includes(value) ? value : defaults.whisperModel
}

export function setWhisperModel(model: WhisperModelSize): WhisperModelSize {
  ensureStore().set('whisperModel', model)
  return model
}

export function getLlmModel(): LlmModelName {
  const value = ensureStore().get('llmModel')
  const validModels: LlmModelName[] = ['gemma-2-3n-instruct-q4_k_m', 'llama-3.2-3b-instruct-q4_k_m']
  return validModels.includes(value) ? value : defaults.llmModel
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

export function setOpenAIApiKey(key: string): void {
  if (!key) {
    ensureStore().delete('openaiApiKey')
    return
  }
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(key)
    ensureStore().set('openaiApiKey', encrypted.toString('base64'))
    return
  }
  ensureStore().set('openaiApiKey', key)
}

export function getOpenAIApiKey(): string | null {
  const raw = store.get('openaiApiKey')
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

export function setGeminiApiKey(key: string): void {
  if (!key) {
    ensureStore().delete('geminiApiKey')
    return
  }
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(key)
    ensureStore().set('geminiApiKey', encrypted.toString('base64'))
    return
  }
  ensureStore().set('geminiApiKey', key)
}

export function getGeminiApiKey(): string | null {
  const raw = store.get('geminiApiKey')
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
  const value = ensureStore().get('preferredLlmProvider')
  return value === 'local' || value === 'cloud' ? value : defaults.preferredLlmProvider
}

export function setPreferredLlmProvider(provider: 'local' | 'cloud'): 'local' | 'cloud' {
  ensureStore().set('preferredLlmProvider', provider)
  return provider
}

export function getCloudModel(): CloudModelName {
  const value = ensureStore().get('cloudModel')
  const validModels: CloudModelName[] = [
    'claude-sonnet-4-5-20250514',
    'claude-opus-4-6-20250612',
    'claude-haiku-3-5-20241022',
    'claude-3-5-sonnet-20241022',
    'claude-3-opus-20240229',
    'claude-3-haiku-20240307',
    'gpt-4o',
    'gpt-4o-mini',
    'gemini-2.5-flash',
    'gemini-2.5-pro'
  ]
  return validModels.includes(value) ? value : defaults.cloudModel
}

export function setCloudModel(model: CloudModelName): CloudModelName {
  ensureStore().set('cloudModel', model)
  return model
}

export function getLocalOnlyMode(): boolean {
  const value = ensureStore().get('localOnlyMode')
  return typeof value === 'boolean' ? value : defaults.localOnlyMode
}

export function setLocalOnlyMode(enabled: boolean): boolean {
  ensureStore().set('localOnlyMode', enabled)
  return enabled
}

export function getUsageStats(): UsageStats {
  const value = ensureStore().get('usageStats')
  // Validate structure
  if (
    !value ||
    typeof value.totalCost !== 'number' ||
    typeof value.totalRequests !== 'number' ||
    typeof value.lastReset !== 'string' ||
    value.totalCost < 0 ||
    value.totalRequests < 0
  ) {
    return defaults.usageStats
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
  const value = ensureStore().get('translationTargetLanguage')
  // Validate it's a non-empty string with reasonable length (ISO language codes are 2-5 chars)
  return typeof value === 'string' && value.length >= 2 && value.length <= 5
    ? value
    : defaults.translationTargetLanguage
}

export function setTranslationTargetLanguage(language: string): string {
  ensureStore().set('translationTargetLanguage', language)
  return language
}
