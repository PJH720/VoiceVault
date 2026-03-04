import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AudioLevelEvent, RecordingResult } from '../../../shared/types'

type RecordingState = {
  isRecording: boolean
  levels: number[]
  durationMs: number
  permissionGranted: boolean | null
  lastResult: RecordingResult | null
  errorMessage: string | null
  requestPermission: () => Promise<boolean>
  startRecording: () => Promise<void>
  stopRecording: () => Promise<RecordingResult | null>
}

export function useRecording(): RecordingState {
  const { t } = useTranslation()
  const [isRecording, setIsRecording] = useState(false)
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null)
  const [levels, setLevels] = useState<number[]>([])
  const [durationMs, setDurationMs] = useState(0)
  const [lastResult, setLastResult] = useState<RecordingResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const startedAtRef = useRef<number>(0)
  const stopLevelListenerRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!isRecording) return
    const timer = setInterval(() => {
      setDurationMs(Date.now() - startedAtRef.current)
    }, 100)

    return () => clearInterval(timer)
  }, [isRecording])

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const granted = await window.api.requestMicPermission()
    setPermissionGranted(granted)
    if (!granted) {
      setErrorMessage(t('recording.micPermissionDenied'))
    }
    return granted
  }, [])

  const startRecording = useCallback(async (): Promise<void> => {
    setErrorMessage(null)
    const granted = permissionGranted ?? (await requestPermission())
    if (!granted) return

    setLevels([])
    setDurationMs(0)
    startedAtRef.current = Date.now()

    if (!stopLevelListenerRef.current) {
      stopLevelListenerRef.current = window.api.onAudioLevel((event: AudioLevelEvent) => {
        setLevels((prev) => [...prev.slice(-159), event.rms])
      })
    }

    await window.api.startRecording()
    setIsRecording(true)
  }, [permissionGranted, requestPermission])

  const stopRecording = useCallback(async (): Promise<RecordingResult | null> => {
    if (!isRecording) return null
    const result = await window.api.stopRecording()
    setIsRecording(false)
    setLastResult(result)
    return result
  }, [isRecording])

  useEffect(() => {
    return () => {
      if (stopLevelListenerRef.current) {
        stopLevelListenerRef.current()
      }
    }
  }, [])

  return {
    isRecording,
    levels,
    durationMs,
    permissionGranted,
    lastResult,
    errorMessage,
    requestPermission,
    startRecording,
    stopRecording
  }
}
