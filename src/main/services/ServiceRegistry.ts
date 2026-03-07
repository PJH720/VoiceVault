import type Database from 'better-sqlite3'
import { getLlmModel, getWhisperModel } from '../store'
import { LLMService } from './LLMService'
import { WhisperService } from './WhisperService'
import { EmbeddingService } from './EmbeddingService'
import { DiarizationService } from './DiarizationService'
import { TranslationService } from './TranslationService'

/**
 * Singleton registry that lazy-creates and caches service instances.
 * Ensures only ONE instance of each service exists throughout the app lifecycle.
 * Prevents double model loading and wasted memory.
 */
class ServiceRegistryImpl {
  private llmService: LLMService | null = null
  private whisperService: WhisperService | null = null
  private embeddingService: EmbeddingService | null = null
  private diarizationService: DiarizationService | null = null
  private translationService: TranslationService | null = null

  /**
   * Get or create the singleton LLMService instance.
   * Uses the current LLM model from settings.
   */
  public getLLMService(): LLMService {
    if (!this.llmService) {
      this.llmService = new LLMService(getLlmModel())
    }
    return this.llmService
  }

  /**
   * Get or create the singleton WhisperService instance.
   * Uses the current Whisper model from settings.
   */
  public getWhisperService(): WhisperService {
    if (!this.whisperService) {
      this.whisperService = new WhisperService(getWhisperModel())
    }
    return this.whisperService
  }

  /**
   * Get or create the singleton EmbeddingService instance.
   */
  public getEmbeddingService(): EmbeddingService {
    if (!this.embeddingService) {
      this.embeddingService = new EmbeddingService()
    }
    return this.embeddingService
  }

  /**
   * Get or create the singleton DiarizationService instance.
   */
  public getDiarizationService(): DiarizationService {
    if (!this.diarizationService) {
      this.diarizationService = new DiarizationService()
    }
    return this.diarizationService
  }

  /**
   * Get or create the singleton TranslationService instance.
   * Shares the same LLMService instance as other services.
   */
  public getTranslationService(db: Database.Database): TranslationService {
    if (!this.translationService) {
      // Pass shared LLMService to TranslationService to avoid double loading
      this.translationService = new TranslationService(db, this.getLLMService())
    }
    return this.translationService
  }

  /**
   * Shutdown all created services. Calls destroy/unload on each.
   * Should be called on app quit (before-quit event).
   */
  public async shutdown(): Promise<void> {
    const shutdownTasks: Array<Promise<void>> = []

    if (this.whisperService) {
      shutdownTasks.push(
        Promise.resolve().then(() => {
          this.whisperService?.destroy()
        })
      )
    }

    if (this.llmService) {
      shutdownTasks.push(this.llmService.unload())
    }

    if (this.embeddingService) {
      shutdownTasks.push(
        Promise.resolve().then(() => {
          this.embeddingService?.destroy()
        })
      )
    }

    if (this.diarizationService) {
      shutdownTasks.push(
        Promise.resolve().then(() => {
          this.diarizationService?.destroy()
        })
      )
    }

    // Wait for all shutdowns with 5s timeout
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 5000))
    await Promise.race([Promise.all(shutdownTasks), timeout])

    // Clear references
    this.llmService = null
    this.whisperService = null
    this.embeddingService = null
    this.diarizationService = null
    this.translationService = null
  }
}

// Export singleton instance
export const ServiceRegistry = new ServiceRegistryImpl()
