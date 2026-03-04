import Store from 'electron-store'
import type { LlmModelName, SupportedLocale, WhisperModelSize } from '../shared/types'

type StoreShape = {
  locale: SupportedLocale
  whisperModel: WhisperModelSize
  llmModel: LlmModelName
}

const store = new Store<StoreShape>({
  defaults: {
    locale: 'ko',
    whisperModel: 'base',
    llmModel: 'gemma-2-3n-instruct-q4_k_m'
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
