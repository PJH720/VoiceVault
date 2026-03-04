import { useTranslation } from 'react-i18next'

type CostEstimateProps = {
  estimate: { inputTokens: number; outputTokens: number; cost: number } | null
}

export function CostEstimate({ estimate }: CostEstimateProps): React.JSX.Element | null {
  const { t } = useTranslation()
  if (!estimate) return null
  return (
    <div className="cost-estimate">
      {t('summary.estimatedCost', {
        cost: estimate.cost.toFixed(4),
        input: estimate.inputTokens,
        output: estimate.outputTokens
      })}
    </div>
  )
}
