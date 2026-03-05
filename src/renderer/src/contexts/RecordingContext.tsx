import { useMemo, type ReactNode } from 'react'
import { useRecording } from '../hooks/useRecording'
import { RecordingContext } from './recording-context'

export function RecordingProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const {
    isRecording,
    levels,
    durationMs,
    permissionGranted,
    lastResult,
    errorMessage,
    requestPermission,
    startRecording,
    stopRecording
  } = useRecording()

  const value = useMemo(
    () => ({
      isRecording,
      levels,
      durationMs,
      permissionGranted,
      lastResult,
      errorMessage,
      requestPermission,
      startRecording,
      stopRecording
    }),
    [
      isRecording,
      levels,
      durationMs,
      permissionGranted,
      lastResult,
      errorMessage,
      requestPermission,
      startRecording,
      stopRecording
    ]
  )

  return <RecordingContext.Provider value={value}>{children}</RecordingContext.Provider>
}
