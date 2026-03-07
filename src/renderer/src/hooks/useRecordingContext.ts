import { useContext } from 'react'
import { RecordingContext } from '../contexts/recording-context'
import { useRecording } from './useRecording'

type RecordingContextValue = ReturnType<typeof useRecording>

export function useRecordingContext(): RecordingContextValue {
  const context = useContext(RecordingContext)
  if (!context) {
    throw new Error('useRecordingContext must be used within RecordingProvider')
  }
  return context
}
