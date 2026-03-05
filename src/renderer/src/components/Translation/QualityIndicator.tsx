import { useTranslation } from 'react-i18next'

type QualityIndicatorProps = {
  confidence: number
}

export function QualityIndicator({ confidence }: QualityIndicatorProps): React.JSX.Element {
  const { t } = useTranslation()
  const score = Math.max(0, Math.min(1, confidence))
  const label =
    score >= 0.9
      ? t('translation.qualityHigh')
      : score >= 0.75
        ? t('translation.qualityMedium')
        : t('translation.qualityLow')
  return (
    <span className="summary-chip">
      {t('translation.quality', { label, score: Math.round(score * 100) })}
    </span>
  )
}
