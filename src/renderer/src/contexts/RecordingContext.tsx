import { useMemo, type ReactNode } from 'react'
import { useRecording } from '../hooks/useRecording'
import { RecordingContext } from './recording-context'

export function RecordingProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const value = useRecording()
  const stableValue = useMemo(() => value, [value])
  return <RecordingContext.Provider value={stableValue}>{children}</RecordingContext.Provider>
}
