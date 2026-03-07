import type { ExportTemplateSummary } from '../../../../shared/types'
import { useTranslation } from 'react-i18next'

type TemplateSelectorProps = {
  value: string
  templates: ExportTemplateSummary[]
  onChange: (value: string) => void
}

export function TemplateSelector({
  value,
  templates,
  onChange
}: TemplateSelectorProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div>
      <label htmlFor="export-template">{t('export.template')}</label>
      <select id="export-template" value={value} onChange={(event) => onChange(event.target.value)}>
        {templates.map((template) => (
          <option key={template.name} value={template.name}>
            {template.label}
          </option>
        ))}
      </select>
    </div>
  )
}
