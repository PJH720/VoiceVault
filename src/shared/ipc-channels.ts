export const AudioChannels = {
  START_RECORDING: 'audio:start-recording',
  STOP_RECORDING: 'audio:stop-recording',
  AUDIO_LEVEL: 'audio:level',
  REQUEST_PERMISSION: 'audio:request-permission',
} as const

export const DatabaseChannels = {
  LIST: 'db:recordings:list',
  GET: 'db:recordings:get',
  DELETE: 'db:recordings:delete',
  UPDATE: 'db:recordings:update',
  INSERT: 'db:recordings:insert',
} as const

export const SettingsChannels = {
  GET_LOCALE: 'settings:get-locale',
  SET_LOCALE: 'settings:set-locale',
} as const

export const AppChannels = {
  GET_PATH: 'app:get-path',
  GET_VERSION: 'app:get-version',
} as const
