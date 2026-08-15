import { describe, expect, it } from 'vitest'

import { lengthDistribution } from '../src/analyze/length.js'
import { normaliseRecords } from '../src/analyze/records.js'

/** A text record of exactly `chars` characters -> ceil(chars/4) estimated tokens. */
const sized = (chars: number) => ({ text: 'a'.repeat(chars) })

describe('lengthDistribution', () => {
  it('reports count, min and max', () => {
    const records = normaliseRecords([sized(4), sized(40), sized(400)])
    const d = lengthDistribution(records)

    expect(d.count).toBe(3)
    expect(d.min).toBe(1)
    expect(d.max).toBe(100)
  })

  it('computes the mean', () => {
    const records = normaliseRecords([sized(4), sized(8), sized(12)])
    // 1, 2, 3 tokens
    expect(lengthDistribution(records).mean).toBeCloseTo(2, 10)
  })

  it('computes the median for an odd count', () => {
    const records = normaliseRecords([sized(4), sized(8), sized(400)])
    expect(lengthDistribution(records).median).toBe(2)
  })

  it('computes the median as the midpoint for an even count', () => {
    const records = normaliseRecords([sized(4), sized(8), sized(12), sized(16)])
    // tokens 1,2,3,4 -> median 2.5
    expect(lengthDistribution(records).median).toBe(2.5)
  })

  it('computes p95', () => {
    const records = normaliseRecords(
      Array.from({ length: 100 }, (_, i) => sized((i + 1) * 4)),
    )
    // tokens 1..100, p95 with linear interpolation over 0-based ranks: 1 + 0.95*99 = 95.05
    expect(lengthDistribution(records).p95).toBeCloseTo(95.05, 2)
  })

  it('sums the total estimated tokens, which is what drives cost', () => {
    const records = normaliseRecords([sized(4), sized(8), sized(12)])
    expect(lengthDistribution(records).totalTokens).toBe(6)
  })

  it('labels its unit as an estimate, not a tokenizer count', () => {
    expect(lengthDistribution(normaliseRecords([sized(4)])).unit).toBe('estimated-tokens')
  })

  it('flags a long outlier by the IQR rule and names its line', () => {
    const records = normaliseRecords([
      ...Array.from({ length: 20 }, () => sized(40)), // 10 tokens each
      sized(4000), // 1000 tokens — wildly out
    ])

    const d = lengthDistribution(records)

    expect(d.outliers).toHaveLength(1)
    expect(d.outliers[0]!.line).toBe(21)
    expect(d.outliers[0]!.tokens).toBe(1000)
    expect(d.outliers[0]!.direction).toBe('long')
  })

  it('flags a suspiciously short outlier too', () => {
    const records = normaliseRecords([
      ...Array.from({ length: 20 }, () => sized(400)), // 100 tokens
      sized(4), // 1 token
    ])

    const d = lengthDistribution(records)
    expect(d.outliers.some((o) => o.line === 21 && o.direction === 'short')).toBe(true)
  })

  it('reports no outliers for a uniform dataset', () => {
    const records = normaliseRecords(Array.from({ length: 20 }, () => sized(40)))
    expect(lengthDistribution(records).outliers).toEqual([])
  })

  it('breaks the estimate down by prompt and answer side', () => {
    const records = normaliseRecords([
      { instruction: 'a'.repeat(40), input: '', output: 'b'.repeat(8) },
    ])
    const d = lengthDistribution(records)

    expect(d.promptTokens.mean).toBe(10)
    expect(d.completionTokens.mean).toBe(2)
  })

  it('handles an empty dataset without NaN', () => {
    const d = lengthDistribution([])
    expect(d.count).toBe(0)
    expect(d.mean).toBe(0)
    expect(d.median).toBe(0)
    expect(d.p95).toBe(0)
    expect(d.outliers).toEqual([])
    expect(Number.isNaN(d.min)).toBe(false)
  })

  it('handles a single record', () => {
    const d = lengthDistribution(normaliseRecords([sized(40)]))
    expect(d.min).toBe(10)
    expect(d.max).toBe(10)
    expect(d.median).toBe(10)
    expect(d.outliers).toEqual([])
  })

  it('reports no outliers when the data is bimodal rather than outlying', () => {
    // A 40/50 split between two lengths is two populations, not a set of stray
    // records, and Tukey correctly declines to call either half an outlier.
    const records = normaliseRecords([
      ...Array.from({ length: 40 }, () => sized(40)),
      ...Array.from({ length: 50 }, () => sized(8000)),
    ])
    expect(lengthDistribution(records).outliers).toEqual([])
  })

  it('caps how many outliers it lists so a broken file stays readable', () => {
    const records = normaliseRecords([
      ...Array.from({ length: 200 }, () => sized(40)),
      ...Array.from({ length: 30 }, () => sized(4000)),
    ])
    expect(lengthDistribution(records).outliers.length).toBeLessThanOrEqual(20)
    expect(lengthDistribution(records).outlierCount).toBeGreaterThan(20)
  })
})
