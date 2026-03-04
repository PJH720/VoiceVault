import { useTranslation } from 'react-i18next'

type MarkdownPreviewProps = {
  content: string
}

export function MarkdownPreview({ content }: MarkdownPreviewProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="export-preview">
      <pre>{content || t('export.noPreview')}</pre>
    </div>
  )
}
