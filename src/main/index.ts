import { app, shell, BrowserWindow, ipcMain, Tray, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { DatabaseService } from './services/DatabaseService'
import { AudioCaptureService } from './services/AudioCaptureService'
import { registerAudioHandlers } from './ipc/audio'
import { registerDatabaseHandlers } from './ipc/database'
import { registerTranscriptionHandlers } from './ipc/transcription'
import { registerSummarizationHandlers } from './ipc/summarization'
import { AppChannels, SettingsChannels } from '../shared/ipc-channels'
import { getLocale, setLocale, getWhisperModel, setWhisperModel, getLlmModel, setLlmModel } from './store'
import type { LlmModelName, SupportedLocale } from '../shared/types'

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

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.voicevault')
  process.env.VOICEVAULT_USER_DATA_PATH = app.getPath('userData')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  databaseService = new DatabaseService()
  audioService = new AudioCaptureService()
  registerDatabaseHandlers(databaseService)
  const mainWindow = createWindow()
  const transcriptionRuntime = registerTranscriptionHandlers(mainWindow, databaseService)
  registerSummarizationHandlers(mainWindow, databaseService)
  registerAudioHandlers(audioService, databaseService, transcriptionRuntime)

  ipcMain.handle(AppChannels.GET_PATH, (_event, name: Parameters<typeof app.getPath>[0]) => {
    return app.getPath(name)
  })
  ipcMain.handle(AppChannels.GET_VERSION, () => app.getVersion())
  ipcMain.handle(SettingsChannels.GET_LOCALE, () => getLocale())
  ipcMain.handle(SettingsChannels.SET_LOCALE, (_event, locale: SupportedLocale) =>
    setLocale(locale)
  )
  ipcMain.handle(SettingsChannels.GET_WHISPER_MODEL, () => getWhisperModel())
  ipcMain.handle(SettingsChannels.SET_WHISPER_MODEL, (_event, model: 'base' | 'small' | 'medium' | 'large-v3-turbo') =>
    setWhisperModel(model)
  )
  ipcMain.handle(SettingsChannels.GET_LLM_MODEL, () => getLlmModel())
  ipcMain.handle(SettingsChannels.SET_LLM_MODEL, (_event, model: LlmModelName) => setLlmModel(model))
  setupTray()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  tray?.destroy()
  tray = null
  databaseService?.close()
})

function setupTray(): void {
  tray = new Tray(icon)
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open VoiceVault',
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
      label: 'Quit',
      click: () => app.quit()
    }
  ])

  tray.setToolTip('VoiceVault')
  tray.setContextMenu(contextMenu)
  tray.on('click', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.isVisible() ? win.hide() : win.show()
    }
  })
}
