import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RecordingTemplate } from '../../../../shared/types'

type TemplateEditorProps = {
  template?: RecordingTemplate | null
  onSave: () => Promise<void>
  onCancel: () => void
}

type EditableState = {
  name: string
  description: string
  icon: string
  color: string
  keywords: string
  summaryPrompt: string
  actionItemsPrompt: string
  keyPointsPrompt: string
}

function fromTemplate(template?: RecordingTemplate | null): EditableState {
  return {
    name: template?.name ?? '',
    description: template?.description ?? '',
    icon: template?.icon ?? '📄',
    color: template?.color ?? '#6b7280',
    keywords: (template?.keywords ?? []).join(', '),
    summaryPrompt: template?.prompts.summary ?? '',
    actionItemsPrompt: template?.prompts.actionItems ?? '',
    keyPointsPrompt: template?.prompts.keyPoints ?? ''
  }
}

export function TemplateEditor({ template, onSave, onCancel }: TemplateEditorProps): React.JSX.Element {
  const { t } = useTranslation()
  const [form, setForm] = useState<EditableState>(() => fromTemplate(template))
  const keywords = useMemo(
    () =>
      form.keywords
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    [form.keywords]
  )

  const save = async (): Promise<void> => {
    const payload = {
      name: form.name,
      description: form.description,
      icon: form.icon,
      color: form.color,
      keywords,
      prompts: {
        summary: form.summaryPrompt,
        actionItems: form.actionItemsPrompt || undefined,
        keyPoints: form.keyPointsPrompt || undefined
      },
      exportTemplate: 'meeting-notes',
      author: 'user'
    }
    if (template?.category === 'custom') {
      await window.api.templates.update(template.id, payload)
    } else if (!template) {
      await window.api.templates.create(payload)
    }
    await onSave()
  }

  return (
    <div className="panel">
      <h3>{template ? t('templates.detailTitle') : t('templates.createTitle')}</h3>
      <div className="template-editor-grid">
        <label>
          {t('templates.name')}
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </label>
        <label>
          {t('templates.icon')}
          <input value={form.icon} onChange={(event) => setForm({ ...form, icon: event.target.value })} />
        </label>
        <label>
          {t('templates.description')}
          <input
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </label>
        <label>
          {t('templates.color')}
          <input value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} />
        </label>
        <label>
          {t('templates.keywords')}
          <input
            value={form.keywords}
            onChange={(event) => setForm({ ...form, keywords: event.target.value })}
          />
        </label>
        <label>
          {t('templates.summaryPrompt')}
          <textarea
            rows={3}
            value={form.summaryPrompt}
            onChange={(event) => setForm({ ...form, summaryPrompt: event.target.value })}
          />
        </label>
        <label>
          {t('templates.actionItemsPrompt')}
          <textarea
            rows={2}
            value={form.actionItemsPrompt}
            onChange={(event) => setForm({ ...form, actionItemsPrompt: event.target.value })}
          />
        </label>
        <label>
          {t('templates.keyPointsPrompt')}
          <textarea
            rows={2}
            value={form.keyPointsPrompt}
            onChange={(event) => setForm({ ...form, keyPointsPrompt: event.target.value })}
          />
        </label>
      </div>
      <div className="template-actions">
        <button onClick={onCancel}>{t('templates.close')}</button>
        {template?.category !== 'built-in' ? (
          <button onClick={() => void save()}>{t('templates.save')}</button>
        ) : null}
      </div>
    </div>
  )
}
