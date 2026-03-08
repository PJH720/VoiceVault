import { TranslationChannels } from '../../shared/ipc-channels'
import type {
  BatchTranslationItem,
  SupportedLanguage,
  TranslationResult
} from '../../shared/types'
import { getLlmModel, getTranslationTargetLanguage, setTranslationTargetLanguage } from '../services/settings'
import { ServiceRegistry } from '../services/registry'

export const translationRPCHandlers = {
  [TranslationChannels.TRANSLATE]: async (params: {
    text: string
    sourceLanguage: string
    targetLanguage: string
    segmentId?: number
  }): Promise<TranslationResult> => {
    const llm = ServiceRegistry.getLlmSubprocess()
    const prompt = `Translate the following text from ${params.sourceLanguage} to ${params.targetLanguage}. Output only the translation, nothing else.\n\nText: ${params.text}`

    let translated = ''
    await llm.streamCompletion(prompt, `${getLlmModel()}.gguf`, (token) => {
      translated += token
    })

    return {
      originalText: params.text,
      translatedText: translated.trim(),
      sourceLanguage: params.sourceLanguage,
      targetLanguage: params.targetLanguage,
      confidence: 0.8,
      model: getLlmModel()
    }
  },

  [TranslationChannels.BATCH_TRANSLATE]: async (params: {
    items: BatchTranslationItem[]
    sourceLanguage: string
    targetLanguage: string
  }): Promise<Array<{ id: number; result: TranslationResult }>> => {
    const results: Array<{ id: number; result: TranslationResult }> = []
    for (const item of params.items) {
      const result = await translationRPCHandlers[TranslationChannels.TRANSLATE]({
        text: item.text,
        sourceLanguage: params.sourceLanguage,
        targetLanguage: params.targetLanguage,
        segmentId: item.id
      })
      results.push({ id: item.id, result })
    }
    return results
  },

  [TranslationChannels.GET_LANGUAGES]: async (): Promise<{
    languages: SupportedLanguage[]
  }> => {
    return {
      languages: [
        { code: 'ko', name: 'Korean' },
        { code: 'en', name: 'English' },
        { code: 'ja', name: 'Japanese' },
        { code: 'zh', name: 'Chinese' },
        { code: 'es', name: 'Spanish' },
        { code: 'fr', name: 'French' },
        { code: 'de', name: 'German' }
      ]
    }
  },

  [TranslationChannels.SET_TARGET_LANGUAGE]: async (params: {
    language: string
  }): Promise<{ language: string }> => {
    return { language: setTranslationTargetLanguage(params.language) }
  },

  [TranslationChannels.GET_TARGET_LANGUAGE]: async (): Promise<{ language: string }> => {
    return { language: getTranslationTargetLanguage() }
  }
}
