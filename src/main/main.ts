import { BrowserWindow, BrowserView, Tray, PATHS } from 'electrobun'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { setUserDataPath } from './types'
import { getDb, closeDb } from './services/db'
import { closeSettings, getLocale } from './services/settings'
import { ServiceRegistry } from './services/registry'
import { allRPCHandlers } from './rpc/index'
import { startHttpRpcServer, stopHttpRpcServer } from './http-rpc'

// ── Startup checkpoint ──────────────────────────────────────────────────────
console.log('[VoiceVault] Worker process starting...')

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

// ── Start HTTP RPC server ────────────────────────────────────────────────────
// Done EARLY — before any blocking native FFI calls — so the RPC bridge is
// reachable even in headless/test environments where BrowserWindow may block.
const HTTP_RPC_PORT = Number(process.env.VOICEVAULT_RPC_PORT) || 50100
const { port: rpcPort } = startHttpRpcServer(allRPCHandlers, HTTP_RPC_PORT)

// ── Cleanup ──────────────────────────────────────────────────────────────────
// Declared early so signal handlers (registered below) can reference it.
// Uses a null ref for tray because tray is created AFTER the blocking
// BrowserWindow call — if a signal fires before tray is up, skip tray teardown.
let isCleaningUp = false
let trayRef: Tray | null = null

function cleanup(): void {
  if (isCleaningUp) return
  isCleaningUp = true

  console.log('[VoiceVault] Shutting down...')

  // 1. Stop HTTP RPC server — releases port immediately so the next launch
  //    doesn't hit EADDRINUSE even if the OS hasn't fully reaped the process.
  stopHttpRpcServer()

  try {
    // 2. Shutdown background services (Whisper/LLM subprocesses, etc.)
    ServiceRegistry.shutdown().catch((err) => {
      console.error('[shutdown] ServiceRegistry shutdown failed:', err)
    })
    // 3. Flush and close SQLite databases
    closeDb()
    closeSettings()
    // 4. Remove tray icon — guarded: tray may not be created yet if a signal
    //    fires early (e.g. during BrowserWindow init which can block).
    trayRef?.remove()
  } catch (err) {
    console.error('[cleanup] Error during shutdown:', (err as Error).message)
  }
}

// ── Signal handlers — registered BEFORE any blocking native FFI ──────────────
// concurrently sends SIGTERM to all child processes when one exits.
// Ctrl-C sends SIGINT. Both must trigger a clean shutdown.
// Registered here (before new BrowserWindow) so they're active even if the
// GTK event loop blocks during window creation in headless environments.
process.on('SIGINT', () => {
  cleanup()
  process.exit(0)
})

process.on('SIGTERM', () => {
  cleanup()
  process.exit(0)
})

// ── Define typed Electrobun RPC (for native webview bridge) ─────────────────
const rpc = BrowserView.defineRPC({
  handlers: {
    requests: allRPCHandlers
  },
  maxRequestTime: 300_000 // 5 min for long LLM operations
})

// ── Determine renderer URL ──────────────────────────────────────────────────
const isDev = process.env.NODE_ENV === 'development' || process.env.VOICEVAULT_DEV === '1'
const rendererUrl = isDev
  ? 'http://localhost:5173'
  : `file://${join(import.meta.dir, '../../out/renderer/index.html')}`

console.log('[VoiceVault] Electrobun app started successfully')
console.log(`[VoiceVault] Locale: ${getLocale()}, Dev: ${isDev}, RPC port: ${rpcPort}`)

// ── Create main window ───────────────────────────────────────────────────────
// NOTE: This call enters the native GTK/CEF event loop. In headless
// environments it may block here — all critical setup (RPC server, signal
// handlers) is intentionally done above this line.
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

// ── System tray ───────────────────────────────────────────────────────────────
const tray = new Tray({ title: 'VoiceVault' })
trayRef = tray // make available to cleanup()

tray.setMenu([
  { label: 'Open VoiceVault', action: 'open', type: 'normal' },
  { type: 'divider' },
  { label: 'Quit', action: 'quit', type: 'normal' }
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

// ── Window lifecycle ──────────────────────────────────────────────────────────
mainWindow.on('close', () => {
  cleanup()
})
