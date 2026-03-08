import { WhisperSubprocess } from './subprocess/WhisperSubprocess'
import { LlmSubprocess } from './subprocess/LlmSubprocess'

class ServiceRegistryImpl {
  private whisperSubprocess?: WhisperSubprocess
  private llmSubprocess?: LlmSubprocess

  getWhisperSubprocess(): WhisperSubprocess {
    return (this.whisperSubprocess ??= new WhisperSubprocess())
  }

  getLlmSubprocess(): LlmSubprocess {
    return (this.llmSubprocess ??= new LlmSubprocess())
  }

  async shutdown(): Promise<void> {
    this.whisperSubprocess?.abort()
    this.llmSubprocess?.unload()
    this.whisperSubprocess = undefined
    this.llmSubprocess = undefined
  }
}

export const ServiceRegistry = new ServiceRegistryImpl()
