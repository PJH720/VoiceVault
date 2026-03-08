import { app, Menu } from 'electron'
import type { SupportedLocale } from '../shared/types'

type MainLocaleText = {
  file: string
  edit: string
  view: string
  window: string
  help: string
  settings: string
  about: string
  open: string
  quit: string
  tooltip: string
}

const translations: Record<SupportedLocale, MainLocaleText> = {
  ko: {
    file: '파일',
    edit: '편집',
    view: '보기',
    window: '윈도우',
    help: '도움말',
    settings: '설정',
    about: '정보',
    open: 'VoiceVault 열기',
    quit: '종료',
    tooltip: 'VoiceVault'
  },
  en: {
    file: 'File',
    edit: 'Edit',
    view: 'View',
    window: 'Window',
    help: 'Help',
    settings: 'Settings',
    about: 'About',
    open: 'Open VoiceVault',
    quit: 'Quit',
    tooltip: 'VoiceVault'
  },
  ja: {
    file: 'ファイル',
    edit: '編集',
    view: '表示',
    window: 'ウィンドウ',
    help: 'ヘルプ',
    settings: '設定',
    about: '情報',
    open: 'VoiceVault を開く',
    quit: '終了',
    tooltip: 'VoiceVault'
  }
}

export function getMainLocaleText(locale: SupportedLocale): MainLocaleText {
  return translations[locale] ?? translations.en
}

export function buildAppMenu(locale: SupportedLocale): Menu {
  const t = getMainLocaleText(locale)
  return Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { label: `${t.about} ${app.name}`, role: 'about' },
        { type: 'separator' },
        { label: t.settings, accelerator: 'CmdOrCtrl+,' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { label: t.file, submenu: [{ role: 'close' }] },
    {
      label: t.edit,
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    { label: t.view, submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }] },
    { label: t.window, submenu: [{ role: 'minimize' }] },
    { label: t.help, submenu: [{ role: 'togglefullscreen' }] }
  ])
}
