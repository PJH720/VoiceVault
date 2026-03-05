import type { SummaryOutput } from '../../../../shared/types'
import { useTranslation } from 'react-i18next'
import { ActionItemsList } from './ActionItemsList'
import { CostEstimate } from './CostEstimate'
import { DecisionsList } from './DecisionsList'
import { DiscussionPointsList } from './DiscussionPointsList'

type SummaryViewProps = {
  summary: SummaryOutput | null
  streamingText: string
  isGenerating: boolean
  estimatedCost?: { inputTokens: number; outputTokens: number; cost: number } | null
}

export function SummaryView({
  summary,
  streamingText,
  isGenerating,
  estimatedCost = null
}: SummaryViewProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="panel summary-panel">
      <h3>{t('summary.title')}</h3>
      {isGenerating ? (
        <div>
          <p className="muted">{t('summary.generating')}</p>
          <CostEstimate estimate={estimatedCost} />
          {streamingText ? <pre className="summary-stream">{streamingText}</pre> : null}
        </div>
      ) : null}

      {!summary && !isGenerating ? <p className="muted">{t('summary.empty')}</p> : null}

      {summary ? (
        <div className="summary-sections">
          <section>
            <h4>{t('summary.overview')}</h4>
            <p>{summary.summary}</p>
          </section>
          <section>
            <h4>{t('summary.actionItems')}</h4>
            <ActionItemsList items={summary.actionItems} />
          </section>
          <section>
            <h4>{t('summary.discussionPoints')}</h4>
            <DiscussionPointsList points={summary.discussionPoints} />
          </section>
          <section>
            <h4>{t('summary.decisions')}</h4>
            <DecisionsList decisions={summary.decisions} />
          </section>
        </div>
      ) : null}
    </div>
  )
}
