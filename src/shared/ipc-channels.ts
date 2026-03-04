export const AudioChannels = {
  START_RECORDING: 'audio:start-recording',
  STOP_RECORDING: 'audio:stop-recording',
  AUDIO_LEVEL: 'audio:level',
  REQUEST_PERMISSION: 'audio:request-permission'
} as const

export const DatabaseChannels = {
  LIST: 'db:recordings:list',
  GET: 'db:recordings:get',
  CREATE: 'db:recordings:create',
  DELETE: 'db:recordings:delete',
  UPDATE: 'db:recordings:update',
  SEARCH: 'db:search'
} as const

export const SettingsChannels = {
  GET_LOCALE: 'settings:get-locale',
  SET_LOCALE: 'settings:set-locale',
  GET_WHISPER_MODEL: 'settings:get-whisper-model',
  SET_WHISPER_MODEL: 'settings:set-whisper-model',
  GET_LLM_MODEL: 'settings:get-llm-model',
  SET_LLM_MODEL: 'settings:set-llm-model'
} as const

export const AppChannels = {
  GET_PATH: 'app:get-path',
  GET_VERSION: 'app:get-version'
} as const

export const WhisperChannels = {
  START_STREAM: 'whisper:transcribe-stream',
  STOP: 'whisper:stop',
  DOWNLOAD_MODEL: 'whisper:download-model',
  MODEL_STATUS: 'whisper:model-status',
  SET_MODEL: 'whisper:set-model',
  GET_MODEL: 'whisper:get-model',
  SAVE_SEGMENTS: 'whisper:save-segments',
  LIST_SEGMENTS: 'whisper:list-segments',
  ON_SEGMENT: 'whisper:on-segment',
  ON_DOWNLOAD_PROGRESS: 'whisper:download-progress'
} as const

export const LlmChannels = {
  SUMMARIZE_STREAM: 'llm:summarize-stream',
  STOP: 'llm:stop',
  DOWNLOAD_MODEL: 'llm:download-model',
  MODEL_STATUS: 'llm:model-status',
  UNLOAD: 'llm:unload',
  SAVE_SUMMARY: 'llm:save-summary',
  GET_LATEST_SUMMARY: 'llm:get-latest-summary',
  ON_TOKEN: 'llm:on-token',
  ON_COMPLETE: 'llm:on-complete',
  ON_DOWNLOAD_PROGRESS: 'llm:download-progress'
} as const
