import { BrowserWindow, BrowserView, Tray, PATHS } from 'electrobun'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { setUserDataPath } from './types'
import { getDb, closeDb } from './services/db'
import { closeSettings, getLocale } from './services/settings'
import { ServiceRegistry } from './services/registry'
import { allRPCHandlers } from './rpc/index'
import { startHttpRpcServer, stopHttpRpcServer } from './http-rpc'

// ── Resolve user data path ──────────────────────────────────────────────────
const homeDir = PATHS.HOME_DIR ?? process.env.HOME ?? require('os').homedir()
const userDataPath =
  process.env.VOICEVAULT_USER_DATA_PATH ??
  join(homeDir, '.voicevault')

mkdirSync(userDataPath, { recursive: true })
setUserDataPath(userDataPath)

// ── Initialize database ─────────────────────────────────────────────────────
const db = getDb()
console.log('[VoiceVault] Database initialized at:', join(userDataPath, 'voicevault.db'))

// ── Define typed RPC ─────────────────────────────────────────────────────────
const rpc = BrowserView.defineRPC({
  handlers: {
    requests: allRPCHandlers
  },
  maxRequestTime: 300_000 // 5 min for long LLM operations
})

// ── Start HTTP RPC server for renderer bridge ──────────────────────────────
const HTTP_RPC_PORT = Number(process.env.VOICEVAULT_RPC_PORT) || 50100
const { port: rpcPort } = startHttpRpcServer(allRPCHandlers, HTTP_RPC_PORT)

// ── Determine renderer URL ──────────────────────────────────────────────────
const isDev = process.env.NODE_ENV === 'development' || process.env.VOICEVAULT_DEV === '1'
const rendererUrl = isDev
  ? 'http://localhost:5173'
  : `file://${join(import.meta.dir, '../../out/renderer/index.html')}`

// ── Create main window ──────────────────────────────────────────────────────
const mainWindow = new BrowserWindow({
  title: 'VoiceVault',
  url: rendererUrl,
  frame: {
    x: 100,
    y: 100,
    width: 1200,
    height: 800
  },
  rpc,
  titleBarStyle: 'default',
  transparent: false
})

console.log('[VoiceVault] Main window created, loading:', rendererUrl)

// ── System tray ──────────────────────────────────────────────────────────────
const tray = new Tray({
  title: 'VoiceVault'
})

tray.setMenu([
  {
    label: 'Open VoiceVault',
    action: 'open',
    type: 'normal'
  },
  { type: 'divider' },
  {
    label: 'Quit',
    action: 'quit',
    type: 'normal'
  }
])

tray.on('tray-clicked', (event: unknown) => {
  const data = event as { data?: { action?: string } }
  const action = data?.data?.action
  if (action === 'open') {
    mainWindow.show()
  } else if (action === 'quit') {
    cleanup()
    process.exit(0)
  }
})

// ── Window lifecycle ─────────────────────────────────────────────────────────
mainWindow.on('close', () => {
  cleanup()
})

// ── Cleanup ──────────────────────────────────────────────────────────────────
// Guard against cleanup() being invoked multiple times (SIGINT + window close,
// or concurrently sending SIGTERM while SIGINT is already in flight).
let isCleaningUp = false

function cleanup(): void {
  if (isCleaningUp) return
  isCleaningUp = true

  console.log('[VoiceVault] Shutting down...')

  // 1. Stop the HTTP RPC server first — releases port 50100 immediately.
  //    This must happen before process.exit() so the port is free for the
  //    next launch without needing lsof cleanup.
  stopHttpRpcServer()

  try {
    // 2. Shutdown background services (Whisper/LLM subprocesses, etc.)
    ServiceRegistry.shutdown().catch((err) => {
      console.error('[shutdown] ServiceRegistry shutdown failed:', err)
    })
    // 3. Flush and close SQLite databases
    closeDb()
    closeSettings()
    // 4. Remove tray icon — calls native.symbols.removeTray() via FFI.
    //    Guard: if native library failed to initialize (e.g. libasar.so not
    //    found on a previous crash), this throws — catch to avoid cascading.
    tray.remove()
  } catch (err) {
    console.error('[cleanup] Error during shutdown:', (err as Error).message)
  }
}

// Handle process termination signals.
// concurrently sends SIGTERM to all child processes when one exits;
// Ctrl-C sends SIGINT. Both must trigger a clean shutdown.
process.on('SIGINT', () => {
  cleanup()
  process.exit(0)
})

process.on('SIGTERM', () => {
  cleanup()
  process.exit(0)
})

console.log('[VoiceVault] Electrobun app started successfully')
console.log(`[VoiceVault] Locale: ${getLocale()}, Dev: ${isDev}, RPC port: ${rpcPort}`)
