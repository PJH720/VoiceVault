import { useContext } from 'react'
import { LibraryContext, type LibraryContextValue } from '../contexts/library-context'

export function useLibraryContext(): LibraryContextValue {
  const context = useContext(LibraryContext)
  if (!context) {
    throw new Error('useLibraryContext must be used within LibraryProvider')
  }
  return context
}
