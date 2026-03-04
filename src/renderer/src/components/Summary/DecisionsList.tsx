type DecisionsListProps = {
  decisions: string[]
}

export function DecisionsList({ decisions }: DecisionsListProps): React.JSX.Element {
  if (decisions.length === 0) return <p className="muted">No decisions.</p>
  return (
    <ul className="summary-bullets">
      {decisions.map((decision, index) => (
        <li key={`${decision}-${index}`}>{decision}</li>
      ))}
    </ul>
  )
}
