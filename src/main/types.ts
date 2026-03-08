/**
 * Main-process singletons and helpers shared across the Electrobun worker.
 * Intentionally minimal — types live in src/shared/types.ts.
 */

// User data path resolved once at startup, then read by all services
let _userDataPath = ''

export function setUserDataPath(p: string): void {
  _userDataPath = p
}

export function getUserDataPath(): string {
  if (!_userDataPath) throw new Error('User data path not set — call setUserDataPath() first')
  return _userDataPath
}
