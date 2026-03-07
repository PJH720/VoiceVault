import type { SummaryKeyStatement } from '../../../../shared/types'
import { useTranslation } from 'react-i18next'

type KeyStatementsListProps = {
  statements: SummaryKeyStatement[]
}

function formatTimestamp(seconds: number): string {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(Math.floor(seconds % 60)).padStart(2, '0')
  return `${mm}:${ss}`
}

export function KeyStatementsList({ statements }: KeyStatementsListProps): React.JSX.Element {
  const { t } = useTranslation()
  if (statements.length === 0) return <p className="muted">{t('summary.emptyKeyStatements')}</p>
  return (
    <ul className="summary-bullets">
      {statements.map((stmt, index) => (
        <li key={`${stmt.text}-${index}`}>
          <span className="summary-timestamp">[{formatTimestamp(stmt.timestamp)}]</span>
          {stmt.speaker ? <span className="summary-chip">{stmt.speaker}</span> : null}
          <span>{stmt.text}</span>
        </li>
      ))}
    </ul>
  )
}
