import type { SummaryActionItem } from '../../../../shared/types'
import { useTranslation } from 'react-i18next'

type ActionItemsListProps = {
  items: SummaryActionItem[]
}

export function ActionItemsList({ items }: ActionItemsListProps): React.JSX.Element {
  const { t } = useTranslation()
  if (items.length === 0) return <p className="muted">{t('summary.emptyActionItems')}</p>
  return (
    <div className="summary-list">
      {items.map((item, index) => (
        <label key={`${item.task}-${index}`} className="summary-action-row">
          <input type="checkbox" />
          <span>{item.task}</span>
          {item.assignee ? <span className="summary-chip">{item.assignee}</span> : null}
          {item.deadline ? <span className="muted">{item.deadline}</span> : null}
        </label>
      ))}
    </div>
  )
}
