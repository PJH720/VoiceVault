type DiscussionPointsListProps = {
  points: string[]
}

export function DiscussionPointsList({ points }: DiscussionPointsListProps): React.JSX.Element {
  if (points.length === 0) return <p className="muted">No discussion points.</p>
  return (
    <ul className="summary-bullets">
      {points.map((point, index) => (
        <li key={`${point}-${index}`}>{point}</li>
      ))}
    </ul>
  )
}
