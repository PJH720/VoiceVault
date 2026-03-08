import { WhisperSubprocess } from './subprocess/WhisperSubprocess'
import { LlmSubprocess } from './subprocess/LlmSubprocess'

/**
 * ServiceRegistry for Electrobun — singleton access to subprocess-based services.
 * Replaces the Electron ServiceRegistry that used native Node.js modules.
 */
class ServiceRegistryImpl {
  private whisperSubprocess: WhisperSubprocess | null = null
  private llmSubprocess: LlmSubprocess | null = null

  public getWhisperSubprocess(): WhisperSubprocess {
    if (!this.whisperSubprocess) {
      this.whisperSubprocess = new WhisperSubprocess()
    }
    return this.whisperSubprocess
  }

  public getLlmSubprocess(): LlmSubprocess {
    if (!this.llmSubprocess) {
      this.llmSubprocess = new LlmSubprocess()
    }
    return this.llmSubprocess
  }

  public async shutdown(): Promise<void> {
    this.whisperSubprocess?.abort()
    this.llmSubprocess?.unload()
    this.whisperSubprocess = null
    this.llmSubprocess = null
  }
}

export const ServiceRegistry = new ServiceRegistryImpl()
