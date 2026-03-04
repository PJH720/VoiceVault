import type { CloudModelName } from '../../shared/types'

const PRICING_PER_1K: Record<CloudModelName, { input: number; output: number }> = {
  // Current models
  'claude-sonnet-4-5-20250514': { input: 0.003, output: 0.015 },
  'claude-opus-4-6-20250612': { input: 0.015, output: 0.075 },
  'claude-haiku-3-5-20241022': { input: 0.0008, output: 0.004 },
  // Legacy models
  'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
  'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
  'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 }
}

export class CostEstimator {
  public static estimateTokens(text: string): number {
    return Math.ceil((text || '').length / 4)
  }

  public static calculateCost(
    model: CloudModelName,
    inputTokens: number,
    outputTokens: number
  ): number {
    const price = PRICING_PER_1K[model]
    return (inputTokens / 1000) * price.input + (outputTokens / 1000) * price.output
  }

  public static estimateCost(
    text: string,
    model: CloudModelName,
    estimatedOutputTokens = 500
  ): { inputTokens: number; outputTokens: number; cost: number } {
    const inputTokens = this.estimateTokens(text)
    const cost = this.calculateCost(model, inputTokens, estimatedOutputTokens)
    return { inputTokens, outputTokens: estimatedOutputTokens, cost }
  }
}
