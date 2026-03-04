import type { SummaryOutput } from '../../../../shared/types'
import { ActionItemsList } from './ActionItemsList'
import { DecisionsList } from './DecisionsList'
import { DiscussionPointsList } from './DiscussionPointsList'

type SummaryViewProps = {
  summary: SummaryOutput | null
  streamingText: string
  isGenerating: boolean
}

export function SummaryView({
  summary,
  streamingText,
  isGenerating
}: SummaryViewProps): React.JSX.Element {
  return (
    <div className="panel summary-panel">
      <h3>Summary</h3>
      {isGenerating ? (
        <div>
          <p className="muted">Generating summary...</p>
          {streamingText ? <pre className="summary-stream">{streamingText}</pre> : null}
        </div>
      ) : null}

      {!summary && !isGenerating ? (
        <p className="muted">Summary will appear during recording.</p>
      ) : null}

      {summary ? (
        <div className="summary-sections">
          <section>
            <h4>Overview</h4>
            <p>{summary.summary}</p>
          </section>
          <section>
            <h4>Action Items</h4>
            <ActionItemsList items={summary.actionItems} />
          </section>
          <section>
            <h4>Discussion Points</h4>
            <DiscussionPointsList points={summary.discussionPoints} />
          </section>
          <section>
            <h4>Decisions</h4>
            <DecisionsList decisions={summary.decisions} />
          </section>
        </div>
      ) : null}
    </div>
  )
}
