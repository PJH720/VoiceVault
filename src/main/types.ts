import type { RPCSchema, ElectrobunRPCSchema } from 'electrobun'

/**
 * Electrobun-specific type augmentations for VoiceVault.
 * Extends the shared types with Electrobun RPC schema definitions.
 */

// Re-export shared types used across the Electrobun main process
export type { RPCSchema, ElectrobunRPCSchema }

// User data path resolved at startup
export let userDataPath: string = ''

export function setUserDataPath(p: string): void {
  userDataPath = p
}

export function getUserDataPath(): string {
  if (!userDataPath) {
    throw new Error('User data path not set — call setUserDataPath() first')
  }
  return userDataPath
}
