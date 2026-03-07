import { createContext } from 'react'
import type { useRecording } from '../hooks/useRecording'

type RecordingContextValue = ReturnType<typeof useRecording>

export const RecordingContext = createContext<RecordingContextValue | null>(null)
