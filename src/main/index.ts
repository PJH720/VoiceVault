import { app, shell, BrowserWindow, ipcMain, Tray, Menu, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { DatabaseService } from './services/DatabaseService'
import { AudioCaptureService } from './services/AudioCaptureService'
import { registerAudioHandlers } from './ipc/audio'
import { registerDatabaseHandlers } from './ipc/database'
import { registerTranscriptionHandlers } from './ipc/transcription'
import { registerSummarizationHandlers } from './ipc/summarization'
import { registerCloudLlmHandlers } from './ipc/cloud-llm'
import { registerDiarizationHandlers } from './ipc/diarization'
import { registerRAGHandlers } from './ipc/rag'
import { registerExportHandlers } from './ipc/export'
import { registerClassificationHandlers } from './ipc/classification'
import { registerSystemAudioHandlers } from './ipc/system-audio'
import { registerTranslationHandlers } from './ipc/translation'
import { buildAppMenu, getMainLocaleText } from './menu'
import { AppChannels, SettingsChannels } from '../shared/ipc-channels'
import {
  initStore,
  getLocale,
  setLocale,
  getWhisperModel,
  setWhisperModel,
  getLlmModel,
  setLlmModel
} from './store'
import type { LlmModelName, SupportedLocale } from '../shared/types'
import { ServiceRegistry } from './services/ServiceRegistry'

let tray: Tray | null = null
let databaseService: DatabaseService | null = null
let audioService: AudioCaptureService | null = null

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.voicevault')
  process.env.VOICEVAULT_USER_DATA_PATH = app.getPath('userData')

  await initStore()

  // Content Security Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "connect-src 'self' http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:*",
            "font-src 'self'",
            "img-src 'self' data:",
            "media-src 'self'"
          ].join('; ')
        ]
      }
    })
  })

  // Security: restrict navigation to app origin only
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      const parsed = new URL(url)
      if (parsed.protocol !== 'file:' && !url.startsWith('http://localhost')) {
        event.preventDefault()
      }
    })
  })

  // Security: only allow microphone permission
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'microphone'].includes(permission)
    callback(allowed)
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  databaseService = new DatabaseService()
  audioService = new AudioCaptureService()
  registerDatabaseHandlers(databaseService)
  const mainWindow = createWindow()
  const transcriptionRuntime = registerTranscriptionHandlers(mainWindow, databaseService)
  registerSummarizationHandlers(mainWindow, databaseService)
  registerCloudLlmHandlers(mainWindow)
  registerDiarizationHandlers(mainWindow, databaseService)
  registerRAGHandlers(mainWindow, databaseService)
  registerExportHandlers(databaseService)
  registerClassificationHandlers(databaseService)
  registerSystemAudioHandlers()
  registerTranslationHandlers(mainWindow, databaseService)
  registerAudioHandlers(audioService, databaseService, transcriptionRuntime)
  // Error reporting from renderer ErrorBoundary
  ipcMain.handle(
    AppChannels.REPORT_ERROR,
    (_event, report: { message: string; stack?: string; page?: string }) => {
      console.error(`[ErrorBoundary] ${report.page ?? 'unknown'}: ${report.message}`)
      if (report.stack) console.error(report.stack)
    }
  )

  Menu.setApplicationMenu(buildAppMenu(getLocale()))

  ipcMain.handle(AppChannels.GET_PATH, (_event, name: Parameters<typeof app.getPath>[0]) => {
    return app.getPath(name)
  })
  ipcMain.handle(AppChannels.GET_VERSION, () => app.getVersion())
  ipcMain.handle(SettingsChannels.GET_LOCALE, () => getLocale())
  ipcMain.handle(SettingsChannels.SET_LOCALE, (_event, locale: SupportedLocale) => {
    const next = setLocale(locale)
    Menu.setApplicationMenu(buildAppMenu(next))
    setupTray(next)
    return next
  })
  ipcMain.handle(SettingsChannels.GET_WHISPER_MODEL, () => getWhisperModel())
  ipcMain.handle(
    SettingsChannels.SET_WHISPER_MODEL,
    (_event, model: 'base' | 'small' | 'medium' | 'large-v3-turbo') => setWhisperModel(model)
  )
  ipcMain.handle(SettingsChannels.GET_LLM_MODEL, () => getLlmModel())
  ipcMain.handle(SettingsChannels.SET_LLM_MODEL, (_event, model: LlmModelName) =>
    setLlmModel(model)
  )
  setupTray(getLocale())

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  tray?.destroy()
  tray = null

  // Stop active recording first
  if (audioService?.recording) {
    try {
      await audioService.stopRecording()
    } catch (err) {
      console.error('[shutdown] AudioCaptureService stop failed:', err)
    }
  }

  // Shutdown all services via ServiceRegistry
  try {
    await ServiceRegistry.shutdown()
  } catch (err) {
    console.error('[shutdown] ServiceRegistry shutdown failed:', err)
  }

  databaseService?.close()
})

function setupTray(locale: SupportedLocale): void {
  const t = getMainLocaleText(locale)
  if (!tray) {
    tray = new Tray(icon)
    tray.on('click', () => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        win.isVisible() ? win.hide() : win.show()
      }
    })
  }
  const contextMenu = Menu.buildFromTemplate([
    {
      label: t.open,
      click: () => {
        const win = BrowserWindow.getAllWindows()[0]
        if (win) {
          win.show()
          win.focus()
        } else {
          createWindow()
        }
      }
    },
    {
      label: t.quit,
      click: () => app.quit()
    }
  ])

  tray.setToolTip(t.tooltip)
  tray.setContextMenu(contextMenu)
}
