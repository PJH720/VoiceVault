import type Database from 'better-sqlite3'
import type {
  BatchTranslationItem,
  SupportedLanguage,
  TranslationResult
} from '../../shared/types'
import { LLMService } from './LLMService'

const LANGUAGE_ENTRIES: Array<[string, string]> = [
  ['en', 'English'], ['ko', 'Korean'], ['ja', 'Japanese'], ['zh', 'Chinese'], ['es', 'Spanish'],
  ['fr', 'French'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'], ['ru', 'Russian'],
  ['ar', 'Arabic'], ['hi', 'Hindi'], ['bn', 'Bengali'], ['ur', 'Urdu'], ['tr', 'Turkish'],
  ['vi', 'Vietnamese'], ['th', 'Thai'], ['id', 'Indonesian'], ['ms', 'Malay'], ['tl', 'Filipino'],
  ['nl', 'Dutch'], ['sv', 'Swedish'], ['no', 'Norwegian'], ['da', 'Danish'], ['fi', 'Finnish'],
  ['pl', 'Polish'], ['cs', 'Czech'], ['sk', 'Slovak'], ['hu', 'Hungarian'], ['ro', 'Romanian'],
  ['bg', 'Bulgarian'], ['uk', 'Ukrainian'], ['el', 'Greek'], ['he', 'Hebrew'], ['fa', 'Persian'],
  ['sr', 'Serbian'], ['hr', 'Croatian'], ['sl', 'Slovenian'], ['lt', 'Lithuanian'], ['lv', 'Latvian'],
  ['et', 'Estonian'], ['ga', 'Irish'], ['cy', 'Welsh'], ['is', 'Icelandic'], ['mt', 'Maltese'],
  ['sq', 'Albanian'], ['mk', 'Macedonian'], ['bs', 'Bosnian'], ['ca', 'Catalan'], ['eu', 'Basque'],
  ['gl', 'Galician'], ['af', 'Afrikaans'], ['sw', 'Swahili'], ['zu', 'Zulu'], ['xh', 'Xhosa'],
  ['am', 'Amharic'], ['so', 'Somali'], ['ha', 'Hausa'], ['yo', 'Yoruba'], ['ig', 'Igbo'],
  ['ne', 'Nepali'], ['si', 'Sinhala'], ['my', 'Burmese'], ['km', 'Khmer'], ['lo', 'Lao'],
  ['mn', 'Mongolian'], ['kk', 'Kazakh'], ['uz', 'Uzbek'], ['ky', 'Kyrgyz'], ['tg', 'Tajik'],
  ['az', 'Azerbaijani'], ['ka', 'Georgian'], ['hy', 'Armenian'], ['ps', 'Pashto'], ['sd', 'Sindhi'],
  ['ta', 'Tamil'], ['te', 'Telugu'], ['kn', 'Kannada'], ['ml', 'Malayalam'], ['mr', 'Marathi'],
  ['gu', 'Gujarati'], ['pa', 'Punjabi'], ['or', 'Odia'], ['as', 'Assamese'], ['sa', 'Sanskrit'],
  ['jv', 'Javanese'], ['su', 'Sundanese'], ['ceb', 'Cebuano'], ['mi', 'Maori'], ['sm', 'Samoan'],
  ['to', 'Tongan'], ['fj', 'Fijian'], ['mg', 'Malagasy'], ['sn', 'Shona'], ['ny', 'Chichewa'],
  ['rw', 'Kinyarwanda'], ['rn', 'Kirundi'], ['ak', 'Akan'], ['ee', 'Ewe'], ['wo', 'Wolof'],
  ['qu', 'Quechua'], ['ay', 'Aymara'], ['gn', 'Guarani'], ['co', 'Corsican'], ['lb', 'Luxembourgish'],
  ['be', 'Belarusian'], ['la', 'Latin'], ['eo', 'Esperanto'], ['br', 'Breton'], ['fo', 'Faroese']
]

const LANGUAGE_MAP = new Map<string, string>(LANGUAGE_ENTRIES)

export class TranslationService {
  private readonly cache = new Map<string, string>()
  private readonly llmService: LLMService

  public constructor(
    private readonly db: Database.Database,
    llmService?: LLMService
  ) {
    this.llmService = llmService ?? new LLMService('gemma-2-3n-instruct-q4_k_m')
    this.loadCacheFromDB()
  }

  public getSupportedLanguages(): SupportedLanguage[] {
    return LANGUAGE_ENTRIES.map(([code, name]) => ({ code, name }))
  }

  public async translate(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
    segmentId?: number
  ): Promise<TranslationResult> {
    const normalized = text.trim()
    if (!normalized) {
      return {
        originalText: '',
        translatedText: '',
        sourceLanguage,
        targetLanguage,
        confidence: 1,
        model: 'empty'
      }
    }

    const cacheKey = this.getCacheKey(normalized, sourceLanguage, targetLanguage)
    const cached = this.cache.get(cacheKey)
    if (cached) {
      if (segmentId) this.persistTranslatedSegment(segmentId, targetLanguage, cached, 1)
      return {
        originalText: normalized,
        translatedText: cached,
        sourceLanguage,
        targetLanguage,
        confidence: 1,
        model: 'cached'
      }
    }

    const prompt = this.buildPrompt(normalized, sourceLanguage, targetLanguage)
    let translated = ''
    try {
      translated = await this.llmService.answerQuestion(prompt, normalized)
    } catch {
      translated = normalized
    }
    const clean = this.cleanupResponse(translated)
    this.cache.set(cacheKey, clean)
    this.persistCache(cacheKey, clean)
    if (segmentId) this.persistTranslatedSegment(segmentId, targetLanguage, clean, 0.85)

    return {
      originalText: normalized,
      translatedText: clean,
      sourceLanguage,
      targetLanguage,
      confidence: 0.85,
      model: this.llmService.getModel()
    }
  }

  public async batchTranslate(
    items: BatchTranslationItem[],
    sourceLanguage: string,
    targetLanguage: string,
    onProgress?: (current: number, total: number, result: TranslationResult, id: number) => void
  ): Promise<Map<number, TranslationResult>> {
    const results = new Map<number, TranslationResult>()
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]
      const result = await this.translate(item.text, sourceLanguage, targetLanguage, item.id)
      results.set(item.id, result)
      onProgress?.(index + 1, items.length, result, item.id)
    }
    return results
  }

  public clearMemoryCache(): void {
    this.cache.clear()
  }

  private buildPrompt(text: string, sourceLanguage: string, targetLanguage: string): string {
    const sourceName = LANGUAGE_MAP.get(sourceLanguage) ?? sourceLanguage
    const targetName = LANGUAGE_MAP.get(targetLanguage) ?? targetLanguage
    return `Translate this text from ${sourceName} to ${targetName}. Return only translated text without explanation:\n${text}`
  }

  private cleanupResponse(value: string): string {
    return value
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/^translation\s*:/i, '')
      .trim()
  }

  private getCacheKey(text: string, sourceLanguage: string, targetLanguage: string): string {
    return `${sourceLanguage}:${targetLanguage}:${text.slice(0, 160)}`
  }

  private loadCacheFromDB(): void {
    try {
      const rows = this.db
        .prepare('SELECT cache_key, translation FROM translation_cache ORDER BY created_at DESC LIMIT 5000')
        .all() as Array<{ cache_key: string; translation: string }>
      for (const row of rows) {
        this.cache.set(row.cache_key, row.translation)
      }
    } catch {
      // migration may not be applied yet
    }
  }

  private persistCache(cacheKey: string, translation: string): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO translation_cache (cache_key, translation, created_at)
         VALUES (?, ?, datetime('now'))`
      )
      .run(cacheKey, translation)
  }

  private persistTranslatedSegment(
    segmentId: number,
    targetLanguage: string,
    translatedText: string,
    confidence: number
  ): void {
    this.db
      .prepare(
        `INSERT INTO translated_segments (segment_id, target_language, translated_text, confidence)
         VALUES (?, ?, ?, ?)`
      )
      .run(segmentId, targetLanguage, translatedText, confidence)
  }
}
