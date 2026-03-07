import type { SummaryOutput } from '../../../../shared/types'
import { useTranslation } from 'react-i18next'
import { ActionItemsList } from './ActionItemsList'
import { CostEstimate } from './CostEstimate'
import { DecisionsList } from './DecisionsList'
import { DiscussionPointsList } from './DiscussionPointsList'
import { KeyStatementsList } from './KeyStatementsList'

type SummaryViewProps = {
  summary: SummaryOutput | null
  streamingText: string
  isGenerating: boolean
  estimatedCost?: { inputTokens: number; outputTokens: number; cost: number } | null
  errorMessage?: string | null
}

export function SummaryView({
  summary,
  streamingText,
  isGenerating,
  estimatedCost = null,
  errorMessage = null
}: SummaryViewProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="panel summary-panel">
      <h3>{t('summary.title')}</h3>

      {errorMessage ? (
        <div className="summary-error">
          <p className="error-text">{t('summary.llmUnavailable')}</p>
          <p className="muted">{t('summary.configureLlm')}</p>
        </div>
      ) : null}

      {isGenerating ? (
        <div>
          <p className="muted">{t('summary.generating')}</p>
          <CostEstimate estimate={estimatedCost} />
          {streamingText ? <pre className="summary-stream">{streamingText}</pre> : null}
        </div>
      ) : null}

      {!summary && !isGenerating && !errorMessage ? (
        <p className="muted">{t('summary.empty')}</p>
      ) : null}

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
            <h4>{t('summary.keyStatements')}</h4>
            <KeyStatementsList statements={summary.keyStatements} />
          </section>
          <section>
            <h4>{t('summary.decisions')}</h4>
            <DecisionsList decisions={summary.decisions} />
          </section>
          {summary.metadata?.cost != null ? (
            <section>
              <CostEstimate
                estimate={{
                  inputTokens: summary.metadata.inputTokens ?? 0,
                  outputTokens: summary.metadata.outputTokens ?? 0,
                  cost: summary.metadata.cost
                }}
              />
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
