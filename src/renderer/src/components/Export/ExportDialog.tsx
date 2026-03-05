import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ExportFolderStructure, ExportOptions, ExportTemplateSummary } from '../../../../shared/types'
import { MarkdownPreview } from './MarkdownPreview'
import { TemplateSelector } from './TemplateSelector'

type ExportDialogProps = {
  open: boolean
  recordingId: number
  onClose: () => void
}

const DEFAULT_TEMPLATE = 'meeting-notes'

export function ExportDialog({ open, recordingId, onClose }: ExportDialogProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE)
  const [vaultPath, setVaultPath] = useState<string | null>(null)
  const [folderStructure, setFolderStructure] = useState<ExportFolderStructure>('by-date')
  const [includeAudio, setIncludeAudio] = useState(true)
  const [preview, setPreview] = useState('')
  const [templates, setTemplates] = useState<ExportTemplateSummary[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    void (async () => {
      const [vault, templateResult] = await Promise.all([
        window.api.export.getVaultPath(),
        window.api.export.getTemplates()
      ])
      setVaultPath(vault.path)
      setTemplates(templateResult.templates)
      if (templateResult.templates.length > 0) {
        setTemplate(templateResult.templates[0].name)
      }
    })()
  }, [open])

  useEffect(() => {
    if (!open) return
    void (async () => {
      try {
        const result = await window.api.export.preview(recordingId, template)
        setPreview(result.content)
      } catch (error) {
        setErrorMessage((error as Error).message)
      }
    })()
  }, [open, recordingId, template])

  if (!open) return null

  const selectVaultPath = async (): Promise<void> => {
    const result = await window.api.export.setVaultPath()
    setVaultPath(result.path)
  }

  const handleExport = async (): Promise<void> => {
    setErrorMessage(null)
    if (!vaultPath) {
      setErrorMessage(t('export.vaultRequired'))
      return
    }
    const options: ExportOptions = {
      templateName: template,
      vaultPath,
      folderStructure,
      includeAudio,
      audioAsAttachment: true,
      generateWikilinks: true
    }
    try {
      await window.api.export.obsidian(recordingId, options)
      onClose()
    } catch (error) {
      setErrorMessage((error as Error).message)
    }
  }

  return (
    <div className="export-dialog-backdrop">
      <div className="panel export-dialog">
        <h3>{t('export.title')}</h3>
        <div className="export-grid">
          <div className="export-controls">
            <TemplateSelector value={template} templates={templates} onChange={setTemplate} />
            <div>
              <label>{t('export.vault')}</label>
              <div className="export-vault-row">
                <input value={vaultPath ?? ''} readOnly placeholder={t('export.vaultNotSelected')} />
                <button onClick={() => void selectVaultPath()}>{t('export.select')}</button>
              </div>
            </div>
            <div>
              <label htmlFor="folder-structure">{t('export.folderStructure')}</label>
              <select
                id="folder-structure"
                value={folderStructure}
                onChange={(event) => setFolderStructure(event.target.value as ExportFolderStructure)}
              >
                <option value="flat">{t('export.folderFlat')}</option>
                <option value="by-date">{t('export.folderByDate')}</option>
                <option value="by-category">{t('export.folderByCategory')}</option>
              </select>
            </div>
            <label className="export-checkbox">
              <input
                type="checkbox"
                checked={includeAudio}
                onChange={(event) => setIncludeAudio(event.target.checked)}
              />
              {t('export.includeAudio')}
            </label>
            {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
            <div className="export-actions">
              <button onClick={onClose}>{t('export.cancel')}</button>
              <button onClick={() => void handleExport()}>{t('export.run')}</button>
            </div>
          </div>
          <div>
            <label>{t('export.preview')}</label>
            <MarkdownPreview content={preview} />
          </div>
        </div>
      </div>
    </div>
  )
}
