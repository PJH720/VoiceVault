import { useTranslation } from 'react-i18next'

type DecisionsListProps = {
  decisions: string[]
}

export function DecisionsList({ decisions }: DecisionsListProps): React.JSX.Element {
  const { t } = useTranslation()
  if (decisions.length === 0) return <p className="muted">{t('summary.emptyDecisions')}</p>
  return (
    <ul className="summary-bullets">
      {decisions.map((decision, index) => (
        <li key={`${decision}-${index}`}>{decision}</li>
      ))}
    </ul>
  )
}
