export const APP_NAME = 'VoiceVault'
export const APP_VERSION = '0.5.0'

export const AUDIO_CONFIG = {
  SAMPLE_RATE: 16000,
  CHANNELS: 1,
  FORMAT: 'f32' as const,
} as const

export const SUPPORTED_LOCALES = ['ko', 'en', 'ja'] as const
export const DEFAULT_LOCALE = 'ko'
