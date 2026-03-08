export const AudioChannels = {
  START_RECORDING: 'audio:start-recording',
  STOP_RECORDING: 'audio:stop-recording',
  CAPTURE_MODE: 'audio:capture-mode',
  AUDIO_LEVEL: 'audio:level',
  REQUEST_PERMISSION: 'audio:request-permission',
  SEND_CHUNK: 'audio:send-chunk'
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
  GET_VERSION: 'app:get-version',
  REPORT_ERROR: 'app:report-error'
} as const

export const SetupChannels = {
  /** Returns SetupStatus — whether required binaries and models are present */
  CHECK: 'setup:check',
  /** Download a Whisper model; responds with { path: string } */
  DOWNLOAD_WHISPER_MODEL: 'setup:download-whisper-model',
} as const

export const WhisperChannels = {
  START_STREAM: 'whisper:transcribe-stream',
  STOP: 'whisper:stop',
  TRANSCRIBE_FILE: 'whisper:transcribe-file',
  BINARY_STATUS: 'whisper:binary-status',
  DOWNLOAD_MODEL: 'whisper:download-model',
  MODEL_STATUS: 'whisper:model-status',
  // SET_MODEL and GET_MODEL removed (issue #214) — use SettingsChannels instead
  SAVE_SEGMENTS: 'whisper:save-segments',
  LIST_SEGMENTS: 'whisper:list-segments',
  ON_SEGMENT: 'whisper:on-segment',
  ON_DOWNLOAD_PROGRESS: 'whisper:download-progress',
  ON_TRANSCRIBE_PROGRESS: 'whisper:transcribe-progress'
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

export const CloudLlmChannels = {
  SUMMARIZE: 'cloud-llm:summarize',
  SET_API_KEY: 'cloud-llm:set-api-key',
  GET_API_KEY: 'cloud-llm:get-api-key',
  SET_OPENAI_API_KEY: 'cloud-llm:set-openai-api-key',
  GET_OPENAI_API_KEY: 'cloud-llm:get-openai-api-key',
  SET_GEMINI_API_KEY: 'cloud-llm:set-gemini-api-key',
  GET_GEMINI_API_KEY: 'cloud-llm:get-gemini-api-key',
  ESTIMATE_COST: 'cloud-llm:estimate-cost',
  USAGE_STATS: 'cloud-llm:usage-stats',
  RESET_STATS: 'cloud-llm:reset-stats',
  SET_LOCAL_ONLY: 'cloud-llm:set-local-only',
  GET_LOCAL_ONLY: 'cloud-llm:get-local-only',
  SET_PROVIDER: 'cloud-llm:set-provider',
  GET_PROVIDER: 'cloud-llm:get-provider',
  SET_MODEL: 'cloud-llm:set-model',
  GET_MODEL: 'cloud-llm:get-model',
  ON_TOKEN: 'cloud-llm:on-token',
  ON_COMPLETE: 'cloud-llm:on-complete'
} as const

export const DiarizationChannels = {
  PROCESS: 'diarization:process',
  ALIGN_TRANSCRIPT: 'diarization:align-transcript',
  LIST_SPEAKER_SEGMENTS: 'diarization:list-speaker-segments',
  ON_SEGMENT: 'diarization:on-segment',
  LIST_SPEAKERS: 'speakers:list',
  CREATE_SPEAKER: 'speakers:create',
  UPDATE_SPEAKER: 'speakers:update',
  MERGE_SPEAKERS: 'speakers:merge'
} as const

export const RagChannels = {
  QUERY: 'rag:query',
  EMBED_RECORDINGS: 'rag:embed-recordings',
  ON_PROGRESS: 'rag:on-progress',
  SEARCH_HISTORY: 'search:history',
  EMBEDDING_MODEL_STATUS: 'rag:embedding-model-status',
  INDEX_STATUS: 'rag:index-status'
} as const

export const ExportChannels = {
  OBSIDIAN: 'export:obsidian',
  BATCH: 'export:batch',
  PREVIEW: 'export:preview',
  SET_VAULT_PATH: 'export:set-vault-path',
  GET_VAULT_PATH: 'export:get-vault-path',
  GET_TEMPLATES: 'export:get-templates'
} as const

export const ClassificationChannels = {
  AUTO_CLASSIFY: 'classification:auto-classify',
  APPLY_TEMPLATE: 'classification:apply-template',
  TEMPLATES_LIST: 'templates:list',
  TEMPLATES_GET: 'templates:get',
  TEMPLATES_CREATE: 'templates:create',
  TEMPLATES_UPDATE: 'templates:update',
  TEMPLATES_DELETE: 'templates:delete',
  TEMPLATES_EXPORT: 'templates:export'
} as const

export const SystemAudioChannels = {
  LIST_SOURCES: 'system-audio:list-sources',
  START_CAPTURE: 'system-audio:start-capture',
  STOP_CAPTURE: 'system-audio:stop-capture',
  CHECK_PERMISSIONS: 'system-audio:check-permissions',
  REQUEST_PERMISSIONS: 'system-audio:request-permissions'
} as const

export const TranslationChannels = {
  TRANSLATE: 'translation:translate',
  BATCH_TRANSLATE: 'translation:batch-translate',
  GET_LANGUAGES: 'translation:get-languages',
  SET_TARGET_LANGUAGE: 'translation:set-target-language',
  GET_TARGET_LANGUAGE: 'translation:get-target-language',
  ON_PROGRESS: 'translation:on-progress',
  ON_TRANSLATED: 'translation:on-translated'
} as const
