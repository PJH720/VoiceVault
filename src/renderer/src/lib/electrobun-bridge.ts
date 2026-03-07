/**
 * Electrobun ↔ Electron renderer bridge.
 *
 * Detects the runtime at startup and provides a single `api` object matching
 * the VoiceVaultApi interface (window.api). Renderer code imports `api` from
 * this module instead of accessing window.api directly — zero churn needed
 * because main.tsx patches window.api on boot.
 *
 * - Electron: passthrough to window.api (set by contextBridge preload)
 * - Electrobun: fetch POST to the HTTP RPC server + WebSocket for push events
 */

// ---------------------------------------------------------------------------
// Runtime detection
// ---------------------------------------------------------------------------

const isElectrobun = typeof (window as Record<string, unknown>).__electrobunWebviewId === 'number'

// ---------------------------------------------------------------------------
// Electrobun RPC transport
// ---------------------------------------------------------------------------

const RPC_PORT: number =
  (window as Record<string, unknown>).__electrobunPort as number | undefined ?? 50100

async function rpcCall<T = unknown>(channel: string, params?: unknown): Promise<T> {
  const res = await fetch(`http://localhost:${RPC_PORT}/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, params })
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string }
    throw new Error(err.error ?? `RPC ${channel} failed: ${res.status}`)
  }
  const json = (await res.json()) as { result: T }
  return json.result
}

// ---------------------------------------------------------------------------
// WebSocket event bus (main → renderer push events)
// ---------------------------------------------------------------------------

type EventCallback = (payload: unknown) => void

const eventListeners = new Map<string, Set<EventCallback>>()
let eventSocket: WebSocket | null = null

function ensureEventSocket(): void {
  if (eventSocket && eventSocket.readyState <= WebSocket.OPEN) return
  eventSocket = new WebSocket(`ws://localhost:${RPC_PORT}/events`)
  eventSocket.addEventListener('message', (ev) => {
    try {
      const { channel, payload } = JSON.parse(ev.data as string) as {
        channel: string
        payload: unknown
      }
      const listeners = eventListeners.get(channel)
      if (listeners) {
        for (const cb of listeners) cb(payload)
      }
    } catch {
      // ignore malformed events
    }
  })
  eventSocket.addEventListener('close', () => {
    // Reconnect after 1 s if there are still active listeners
    if (eventListeners.size > 0) {
      setTimeout(ensureEventSocket, 1000)
    }
  })
}

function onEvent(channel: string, callback: EventCallback): () => void {
  if (!eventListeners.has(channel)) eventListeners.set(channel, new Set())
  eventListeners.get(channel)!.add(callback)
  ensureEventSocket()
  return () => {
    const set = eventListeners.get(channel)
    if (set) {
      set.delete(callback)
      if (set.size === 0) eventListeners.delete(channel)
    }
  }
}

// ---------------------------------------------------------------------------
// Channel constants (inlined to avoid importing Node-only ipc-channels.ts
//  at renderer bundle time — values mirror src/shared/ipc-channels.ts)
// ---------------------------------------------------------------------------

const CH = {
  // Audio
  START_RECORDING: 'audio:start-recording',
  STOP_RECORDING: 'audio:stop-recording',
  REQUEST_PERMISSION: 'audio:request-permission',
  SEND_CHUNK: 'audio:send-chunk',
  CAPTURE_MODE: 'audio:capture-mode',
  AUDIO_LEVEL: 'audio:level',
  // Database
  DB_LIST: 'db:recordings:list',
  DB_GET: 'db:recordings:get',
  DB_CREATE: 'db:recordings:create',
  DB_UPDATE: 'db:recordings:update',
  DB_DELETE: 'db:recordings:delete',
  DB_SEARCH: 'db:search',
  // App
  GET_PATH: 'app:get-path',
  GET_VERSION: 'app:get-version',
  REPORT_ERROR: 'app:report-error',
  // Settings
  GET_LOCALE: 'settings:get-locale',
  SET_LOCALE: 'settings:set-locale',
  GET_WHISPER_MODEL: 'settings:get-whisper-model',
  SET_WHISPER_MODEL: 'settings:set-whisper-model',
  GET_LLM_MODEL: 'settings:get-llm-model',
  SET_LLM_MODEL: 'settings:set-llm-model',
  // Whisper
  WHISPER_START: 'whisper:transcribe-stream',
  WHISPER_STOP: 'whisper:stop',
  WHISPER_TRANSCRIBE_FILE: 'whisper:transcribe-file',
  WHISPER_DOWNLOAD: 'whisper:download-model',
  WHISPER_MODEL_STATUS: 'whisper:model-status',
  WHISPER_BINARY_STATUS: 'whisper:binary-status',
  WHISPER_SAVE_SEGMENTS: 'whisper:save-segments',
  WHISPER_LIST_SEGMENTS: 'whisper:list-segments',
  WHISPER_ON_SEGMENT: 'whisper:on-segment',
  WHISPER_ON_DOWNLOAD_PROGRESS: 'whisper:download-progress',
  // LLM
  LLM_SUMMARIZE: 'llm:summarize-stream',
  LLM_STOP: 'llm:stop',
  LLM_DOWNLOAD: 'llm:download-model',
  LLM_MODEL_STATUS: 'llm:model-status',
  LLM_UNLOAD: 'llm:unload',
  LLM_SAVE_SUMMARY: 'llm:save-summary',
  LLM_GET_LATEST_SUMMARY: 'llm:get-latest-summary',
  LLM_ON_TOKEN: 'llm:on-token',
  LLM_ON_COMPLETE: 'llm:on-complete',
  LLM_ON_DOWNLOAD_PROGRESS: 'llm:download-progress',
  // Cloud LLM
  CLOUD_SET_API_KEY: 'cloud-llm:set-api-key',
  CLOUD_GET_API_KEY: 'cloud-llm:get-api-key',
  CLOUD_SET_OPENAI_KEY: 'cloud-llm:set-openai-api-key',
  CLOUD_GET_OPENAI_KEY: 'cloud-llm:get-openai-api-key',
  CLOUD_SET_GEMINI_KEY: 'cloud-llm:set-gemini-api-key',
  CLOUD_GET_GEMINI_KEY: 'cloud-llm:get-gemini-api-key',
  CLOUD_SUMMARIZE: 'cloud-llm:summarize',
  CLOUD_ESTIMATE_COST: 'cloud-llm:estimate-cost',
  CLOUD_USAGE_STATS: 'cloud-llm:usage-stats',
  CLOUD_RESET_STATS: 'cloud-llm:reset-stats',
  CLOUD_SET_LOCAL_ONLY: 'cloud-llm:set-local-only',
  CLOUD_GET_LOCAL_ONLY: 'cloud-llm:get-local-only',
  CLOUD_SET_PROVIDER: 'cloud-llm:set-provider',
  CLOUD_GET_PROVIDER: 'cloud-llm:get-provider',
  CLOUD_SET_MODEL: 'cloud-llm:set-model',
  CLOUD_GET_MODEL: 'cloud-llm:get-model',
  CLOUD_ON_TOKEN: 'cloud-llm:on-token',
  CLOUD_ON_COMPLETE: 'cloud-llm:on-complete',
  // Diarization
  DIAR_PROCESS: 'diarization:process',
  DIAR_ALIGN: 'diarization:align-transcript',
  DIAR_LIST_SEGMENTS: 'diarization:list-speaker-segments',
  DIAR_ON_SEGMENT: 'diarization:on-segment',
  SPEAKERS_LIST: 'speakers:list',
  SPEAKERS_CREATE: 'speakers:create',
  SPEAKERS_UPDATE: 'speakers:update',
  SPEAKERS_MERGE: 'speakers:merge',
  // RAG
  RAG_QUERY: 'rag:query',
  RAG_EMBED: 'rag:embed-recordings',
  RAG_SEARCH_HISTORY: 'search:history',
  RAG_EMBEDDING_STATUS: 'rag:embedding-model-status',
  RAG_INDEX_STATUS: 'rag:index-status',
  RAG_ON_PROGRESS: 'rag:on-progress',
  // Export
  EXPORT_OBSIDIAN: 'export:obsidian',
  EXPORT_BATCH: 'export:batch',
  EXPORT_PREVIEW: 'export:preview',
  EXPORT_SET_VAULT: 'export:set-vault-path',
  EXPORT_GET_VAULT: 'export:get-vault-path',
  EXPORT_GET_TEMPLATES: 'export:get-templates',
  // Classification
  CLASSIFY_AUTO: 'classification:auto-classify',
  CLASSIFY_APPLY: 'classification:apply-template',
  TEMPLATES_LIST: 'templates:list',
  TEMPLATES_GET: 'templates:get',
  TEMPLATES_CREATE: 'templates:create',
  TEMPLATES_UPDATE: 'templates:update',
  TEMPLATES_DELETE: 'templates:delete',
  TEMPLATES_EXPORT: 'templates:export',
  // System audio
  SYS_LIST_SOURCES: 'system-audio:list-sources',
  SYS_START_CAPTURE: 'system-audio:start-capture',
  SYS_STOP_CAPTURE: 'system-audio:stop-capture',
  SYS_CHECK_PERMISSIONS: 'system-audio:check-permissions',
  SYS_REQUEST_PERMISSIONS: 'system-audio:request-permissions',
  // Translation
  TRANS_TRANSLATE: 'translation:translate',
  TRANS_BATCH: 'translation:batch-translate',
  TRANS_GET_LANGUAGES: 'translation:get-languages',
  TRANS_SET_TARGET: 'translation:set-target-language',
  TRANS_GET_TARGET: 'translation:get-target-language',
  TRANS_ON_PROGRESS: 'translation:on-progress',
  TRANS_ON_TRANSLATED: 'translation:on-translated'
} as const

// ---------------------------------------------------------------------------
// Electrobun implementation of VoiceVaultApi
// Each method packs positional args into the params object the handler expects.
// ---------------------------------------------------------------------------

function buildElectrobunApi(): typeof window.api {
  return {
    // ── Audio ──────────────────────────────────────────────────────────
    startRecording: () => rpcCall(CH.START_RECORDING),
    stopRecording: () => rpcCall(CH.STOP_RECORDING),
    requestMicPermission: () => rpcCall(CH.REQUEST_PERMISSION),
    sendAudioChunk: (pcmData) => {
      // Fire-and-forget — sendAudioChunk is sync void in the preload
      void rpcCall(CH.SEND_CHUNK, { pcmData: Array.from(new Uint8Array(pcmData)) })
    },
    getCaptureMode: () => rpcCall(CH.CAPTURE_MODE),
    onAudioLevel: (callback) => onEvent(CH.AUDIO_LEVEL, callback as EventCallback),

    // ── Database (top-level shortcuts) ────────────────────────────────
    listRecordings: (options?) => rpcCall(CH.DB_LIST, { options }),
    getRecording: (id) => rpcCall(CH.DB_GET, { id }),
    createRecording: (title, duration, audioPath) =>
      rpcCall(CH.DB_CREATE, { title, duration, audioPath }),
    updateRecording: (id, data) => rpcCall(CH.DB_UPDATE, { id, data }),
    deleteRecording: (id, hard) => rpcCall(CH.DB_DELETE, { id, hard }),
    searchRecordings: (query, options?) => rpcCall(CH.DB_SEARCH, { query, options }),

    // ── App ───────────────────────────────────────────────────────────
    getAppPath: (name) => rpcCall(CH.GET_PATH, { name }),
    getVersion: () => rpcCall(CH.GET_VERSION),
    reportError: (report) => rpcCall(CH.REPORT_ERROR, report),

    // ── Settings ──────────────────────────────────────────────────────
    getLocale: () => rpcCall(CH.GET_LOCALE),
    setLocale: (locale) => rpcCall(CH.SET_LOCALE, { locale }),
    getWhisperModel: () => rpcCall(CH.GET_WHISPER_MODEL),
    setWhisperModel: (model) => rpcCall(CH.SET_WHISPER_MODEL, { model }),
    getLlmModel: () => rpcCall(CH.GET_LLM_MODEL),
    setLlmModel: (model) => rpcCall(CH.SET_LLM_MODEL, { model }),

    // ── Transcription ─────────────────────────────────────────────────
    transcription: {
      start: () => rpcCall(CH.WHISPER_START),
      stop: () => rpcCall(CH.WHISPER_STOP),
      saveSegments: (recordingId, segments) =>
        rpcCall(CH.WHISPER_SAVE_SEGMENTS, { recordingId, segments }),
      listSegments: (recordingId) =>
        rpcCall(CH.WHISPER_LIST_SEGMENTS, { recordingId }),
      downloadModel: (modelSize) =>
        rpcCall(CH.WHISPER_DOWNLOAD, { modelSize }),
      checkModel: (modelSize) =>
        rpcCall(CH.WHISPER_MODEL_STATUS, { modelSize }),
      checkBinary: () => rpcCall(CH.WHISPER_BINARY_STATUS),
      transcribeFile: (wavFilePath, language?) =>
        rpcCall(CH.WHISPER_TRANSCRIBE_FILE, { audioPath: wavFilePath, language }),
      onSegment: (callback) => onEvent(CH.WHISPER_ON_SEGMENT, callback as EventCallback),
      onDownloadProgress: (callback) =>
        onEvent(CH.WHISPER_ON_DOWNLOAD_PROGRESS, callback as EventCallback)
    },

    // ── Database (namespaced) ─────────────────────────────────────────
    database: {
      listRecordings: (options?) => rpcCall(CH.DB_LIST, { options }),
      getRecording: (id) => rpcCall(CH.DB_GET, { id }),
      createRecording: (title, duration, audioPath) =>
        rpcCall(CH.DB_CREATE, { title, duration, audioPath }),
      updateRecording: (id, data) => rpcCall(CH.DB_UPDATE, { id, data }),
      deleteRecording: (id, hard?) => rpcCall(CH.DB_DELETE, { id, hard }),
      search: (query, options?) => rpcCall(CH.DB_SEARCH, { query, options })
    },

    // ── LLM ───────────────────────────────────────────────────────────
    llm: {
      summarize: (transcript, type, previousSummary?) =>
        rpcCall(CH.LLM_SUMMARIZE, { transcript, type, previousSummary }),
      stop: () => rpcCall(CH.LLM_STOP),
      downloadModel: (modelName) => rpcCall(CH.LLM_DOWNLOAD, { modelName }),
      checkModel: (modelName?) => rpcCall(CH.LLM_MODEL_STATUS, { modelName }),
      unload: () => rpcCall(CH.LLM_UNLOAD),
      saveSummary: (recordingId, output) =>
        rpcCall(CH.LLM_SAVE_SUMMARY, { recordingId, output }),
      getLatestSummary: (recordingId) =>
        rpcCall(CH.LLM_GET_LATEST_SUMMARY, { recordingId }),
      onToken: (callback) => onEvent(CH.LLM_ON_TOKEN, callback as EventCallback),
      onComplete: (callback) => onEvent(CH.LLM_ON_COMPLETE, callback as EventCallback),
      onDownloadProgress: (callback) =>
        onEvent(CH.LLM_ON_DOWNLOAD_PROGRESS, callback as EventCallback)
    },

    // ── Cloud LLM ─────────────────────────────────────────────────────
    cloudLLM: {
      setApiKey: (key) => rpcCall(CH.CLOUD_SET_API_KEY, { key }),
      getApiKey: () => rpcCall(CH.CLOUD_GET_API_KEY),
      setOpenAIApiKey: (key) => rpcCall(CH.CLOUD_SET_OPENAI_KEY, { key }),
      getOpenAIApiKey: () => rpcCall(CH.CLOUD_GET_OPENAI_KEY),
      setGeminiApiKey: (key) => rpcCall(CH.CLOUD_SET_GEMINI_KEY, { key }),
      getGeminiApiKey: () => rpcCall(CH.CLOUD_GET_GEMINI_KEY),
      summarize: (transcript, model?) =>
        rpcCall(CH.CLOUD_SUMMARIZE, { transcript, model }),
      estimateCost: (text, model) =>
        rpcCall(CH.CLOUD_ESTIMATE_COST, { text, model }),
      getUsageStats: () => rpcCall(CH.CLOUD_USAGE_STATS),
      resetStats: () => rpcCall(CH.CLOUD_RESET_STATS),
      setLocalOnly: (enabled) => rpcCall(CH.CLOUD_SET_LOCAL_ONLY, { enabled }),
      getLocalOnly: () => rpcCall(CH.CLOUD_GET_LOCAL_ONLY),
      setProvider: (provider) => rpcCall(CH.CLOUD_SET_PROVIDER, { provider }),
      getProvider: () => rpcCall(CH.CLOUD_GET_PROVIDER),
      setModel: (model) => rpcCall(CH.CLOUD_SET_MODEL, { model }),
      getModel: () => rpcCall(CH.CLOUD_GET_MODEL),
      onToken: (callback) => onEvent(CH.CLOUD_ON_TOKEN, callback as EventCallback),
      onComplete: (callback) => onEvent(CH.CLOUD_ON_COMPLETE, callback as EventCallback)
    },

    // ── Diarization ───────────────────────────────────────────────────
    diarization: {
      process: (audioPath, recordingId) =>
        rpcCall(CH.DIAR_PROCESS, { audioPath, recordingId }),
      alignTranscript: (recordingId, transcriptSegments, speakerSegments?) =>
        rpcCall(CH.DIAR_ALIGN, { recordingId, transcriptSegments, speakerSegments }),
      listSpeakerSegments: (recordingId) =>
        rpcCall(CH.DIAR_LIST_SEGMENTS, { recordingId }),
      onSegment: (callback) => onEvent(CH.DIAR_ON_SEGMENT, callback as EventCallback),
      listSpeakers: () => rpcCall(CH.SPEAKERS_LIST),
      createSpeaker: (name) => rpcCall(CH.SPEAKERS_CREATE, { name }),
      updateSpeaker: (id, updates) =>
        rpcCall(CH.SPEAKERS_UPDATE, { id, updates }),
      mergeSpeakers: (sourceId, targetId) =>
        rpcCall(CH.SPEAKERS_MERGE, { sourceId, targetId })
    },

    // ── RAG ───────────────────────────────────────────────────────────
    rag: {
      query: (question, topK?) => rpcCall(CH.RAG_QUERY, { question, topK }),
      embedRecordings: () => rpcCall(CH.RAG_EMBED),
      searchHistory: () => rpcCall(CH.RAG_SEARCH_HISTORY),
      embeddingModelStatus: () => rpcCall(CH.RAG_EMBEDDING_STATUS),
      indexStatus: () => rpcCall(CH.RAG_INDEX_STATUS),
      onProgress: (callback) => onEvent(CH.RAG_ON_PROGRESS, callback as EventCallback)
    },

    // ── Export ─────────────────────────────────────────────────────────
    export: {
      obsidian: (recordingId, options) =>
        rpcCall(CH.EXPORT_OBSIDIAN, { recordingId, options }),
      batch: (recordingIds, options) =>
        rpcCall(CH.EXPORT_BATCH, { recordingIds, options }),
      preview: (recordingId, templateName) =>
        rpcCall(CH.EXPORT_PREVIEW, { recordingId, templateName }),
      setVaultPath: () => rpcCall(CH.EXPORT_SET_VAULT),
      getVaultPath: () => rpcCall(CH.EXPORT_GET_VAULT),
      getTemplates: () => rpcCall(CH.EXPORT_GET_TEMPLATES)
    },

    // ── Classification ────────────────────────────────────────────────
    classification: {
      autoClassify: (transcript) =>
        rpcCall(CH.CLASSIFY_AUTO, { transcript }),
      applyTemplate: (recordingId, templateId) =>
        rpcCall(CH.CLASSIFY_APPLY, { recordingId, templateId })
    },

    // ── Templates ─────────────────────────────────────────────────────
    templates: {
      list: () => rpcCall(CH.TEMPLATES_LIST),
      get: (id) => rpcCall(CH.TEMPLATES_GET, { id }),
      create: (input) => rpcCall(CH.TEMPLATES_CREATE, { input }),
      update: (id, updates) => rpcCall(CH.TEMPLATES_UPDATE, { id, updates }),
      delete: (id) => rpcCall(CH.TEMPLATES_DELETE, { id }),
      export: (id) => rpcCall(CH.TEMPLATES_EXPORT, { id })
    },

    // ── System Audio ──────────────────────────────────────────────────
    systemAudio: {
      listSources: () => rpcCall(CH.SYS_LIST_SOURCES),
      startCapture: (config) => rpcCall(CH.SYS_START_CAPTURE, { config }),
      stopCapture: () => rpcCall(CH.SYS_STOP_CAPTURE),
      checkPermissions: () => rpcCall(CH.SYS_CHECK_PERMISSIONS),
      requestPermissions: (type) =>
        rpcCall(CH.SYS_REQUEST_PERMISSIONS, { type })
    },

    // ── Translation ───────────────────────────────────────────────────
    translation: {
      translate: (text, sourceLanguage, targetLanguage, segmentId?) =>
        rpcCall(CH.TRANS_TRANSLATE, { text, sourceLanguage, targetLanguage, segmentId }),
      batchTranslate: (items, sourceLanguage, targetLanguage) =>
        rpcCall(CH.TRANS_BATCH, { items, sourceLanguage, targetLanguage }),
      getLanguages: () => rpcCall(CH.TRANS_GET_LANGUAGES),
      setTargetLanguage: (language) => rpcCall(CH.TRANS_SET_TARGET, { language }),
      getTargetLanguage: () => rpcCall(CH.TRANS_GET_TARGET),
      onProgress: (callback) => onEvent(CH.TRANS_ON_PROGRESS, callback as EventCallback),
      onTranslated: (callback) => onEvent(CH.TRANS_ON_TRANSLATED, callback as EventCallback)
    }
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * The unified API object. In Electron mode, this is `window.api` (set by the
 * preload contextBridge). In Electrobun mode, every method is backed by
 * fetch + WebSocket to the HTTP RPC server.
 */
export const api: typeof window.api = isElectrobun ? buildElectrobunApi() : window.api
