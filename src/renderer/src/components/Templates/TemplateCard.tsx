import type { RecordingTemplate } from '../../../../shared/types'
import { useTranslation } from 'react-i18next'

type TemplateCardProps = {
  template: RecordingTemplate
  onEdit: (template: RecordingTemplate) => void
  onDelete: (id: string) => Promise<void>
}

export function TemplateCard({ template, onEdit, onDelete }: TemplateCardProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="template-card">
      <div className="template-card-head">
        <span>{template.icon}</span>
        <strong>{template.name}</strong>
        <span className="summary-chip">{template.category}</span>
      </div>
      <p className="muted">{template.description}</p>
      <div className="template-keywords">
        {template.keywords.slice(0, 6).map((keyword) => (
          <span key={keyword} className="summary-chip">
            {keyword}
          </span>
        ))}
      </div>
      <div className="template-actions">
        {template.category === 'custom' ? (
          <>
            <button onClick={() => onEdit(template)}>{t('templates.edit')}</button>
            <button className="danger" onClick={() => void onDelete(template.id)}>
              {t('templates.delete')}
            </button>
          </>
        ) : (
          <button onClick={() => onEdit(template)}>{t('templates.view')}</button>
        )}
      </div>
    </div>
  )
}
