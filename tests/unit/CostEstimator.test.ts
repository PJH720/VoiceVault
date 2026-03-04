import { describe, expect, it } from 'vitest'
import { CostEstimator } from '../../src/main/services/CostEstimator'

describe('CostEstimator', () => {
  it('estimates tokens from text length', () => {
    expect(CostEstimator.estimateTokens('')).toBe(0)
    expect(CostEstimator.estimateTokens('abcd')).toBe(1)
    expect(CostEstimator.estimateTokens('abcdefgh')).toBe(2)
  })

  it('calculates model-specific estimated cost', () => {
    const result = CostEstimator.estimateCost('hello world', 'claude-3-5-sonnet-20241022', 500)
    expect(result.inputTokens).toBeGreaterThan(0)
    expect(result.outputTokens).toBe(500)
    expect(result.cost).toBeGreaterThan(0)
  })
})
