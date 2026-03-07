import { useTranslation } from 'react-i18next'

type DiscussionPointsListProps = {
  points: string[]
}

export function DiscussionPointsList({ points }: DiscussionPointsListProps): React.JSX.Element {
  const { t } = useTranslation()
  if (points.length === 0) return <p className="muted">{t('summary.emptyDiscussionPoints')}</p>
  return (
    <ul className="summary-bullets">
      {points.map((point, index) => (
        <li key={`${point}-${index}`}>{point}</li>
      ))}
    </ul>
  )
}
