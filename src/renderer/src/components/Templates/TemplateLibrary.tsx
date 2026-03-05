import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RecordingTemplate } from '../../../../shared/types'
import { TemplateCard } from './TemplateCard'
import { TemplateEditor } from './TemplateEditor'

export function TemplateLibrary(): React.JSX.Element {
  const { t } = useTranslation()
  const [templates, setTemplates] = useState<RecordingTemplate[]>([])
  const [selected, setSelected] = useState<RecordingTemplate | null>(null)
  const [creating, setCreating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const loadTemplates = async (): Promise<void> => {
    try {
      const rows = await window.api.templates.list()
      setTemplates(rows)
    } catch (error) {
      setErrorMessage((error as Error).message)
    }
  }

  useEffect(() => {
    // Async data loading on mount — setState is intentional
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTemplates()
  }, [])

  const removeTemplate = async (id: string): Promise<void> => {
    await window.api.templates.delete(id)
    await loadTemplates()
  }

  return (
    <div className="panel">
      <div className="template-library-head">
        <h3>{t('templates.libraryTitle')}</h3>
        <button onClick={() => setCreating(true)}>{t('templates.newTemplate')}</button>
      </div>
      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
      <div className="template-list">
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            onEdit={(item) => setSelected(item)}
            onDelete={removeTemplate}
          />
        ))}
      </div>
      {selected || creating ? (
        <TemplateEditor
          template={creating ? null : selected}
          onSave={async () => {
            setCreating(false)
            setSelected(null)
            await loadTemplates()
          }}
          onCancel={() => {
            setCreating(false)
            setSelected(null)
          }}
        />
      ) : null}
    </div>
  )
}
