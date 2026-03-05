type ClassificationBadgeProps = {
  templateId?: string
  confidence?: number
}

export function ClassificationBadge({
  templateId,
  confidence
}: ClassificationBadgeProps): React.JSX.Element | null {
  if (!templateId) return null
  const percent = typeof confidence === 'number' ? ` (${(confidence * 100).toFixed(0)}%)` : ''
  return (
    <span className="summary-chip">
      #{templateId}
      {percent}
    </span>
  )
}
