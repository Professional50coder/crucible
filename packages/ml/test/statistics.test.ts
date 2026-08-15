import { describe, expect, it } from 'vitest'

import {
  bootstrapDeltaCI,
  createRng,
  mean,
  percentile,
} from '../src/eval/statistics.js'

describe('createRng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(42)
    const b = createRng(42)
    const first = [a(), a(), a(), a(), a()]
    const second = [b(), b(), b(), b(), b()]
    expect(first).toEqual(second)
  })

  it('produces a different stream for a different seed', () => {
    const a = createRng(1)
    const b = createRng(2)
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()])
  })

  it('stays inside [0, 1)', () => {
    const rng = createRng(7)
    for (let i = 0; i < 5000; i += 1) {
      const value = rng()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('is roughly uniform (mean near 0.5 over 10k draws)', () => {
    const rng = createRng(99)
    let total = 0
    for (let i = 0; i < 10_000; i += 1) total += rng()
    expect(total / 10_000).toBeCloseTo(0.5, 1)
  })
})

describe('mean', () => {
  it('averages values', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5)
  })

  it('returns 0 for an empty array rather than NaN', () => {
    expect(mean([])).toBe(0)
  })
})

describe('percentile', () => {
  const sorted = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

  it('returns the bounds at 0 and 100', () => {
    expect(percentile(sorted, 0)).toBe(0)
    expect(percentile(sorted, 100)).toBe(9)
  })

  it('interpolates linearly between neighbouring ranks', () => {
    // rank = (n - 1) * p = 9 * 0.5 = 4.5 -> halfway between 4 and 5
    expect(percentile(sorted, 50)).toBe(4.5)
    // rank = 9 * 0.25 = 2.25 -> 2 + 0.25 * (3 - 2)
    expect(percentile(sorted, 25)).toBeCloseTo(2.25, 10)
  })

  it('returns 0 for an empty array', () => {
    expect(percentile([], 50)).toBe(0)
  })

  it('returns the only value for a single-element array', () => {
    expect(percentile([3.5], 95)).toBe(3.5)
  })
})

describe('bootstrapDeltaCI', () => {
  const repeat = <T>(value: T, n: number): T[] => new Array<T>(n).fill(value)

  /** Deterministic pseudo-random 0/1 vector with exactly `ones` ones, for stable fixtures. */
  const binary = (n: number, ones: number): number[] =>
    Array.from({ length: n }, (_, i) => (i < ones ? 1 : 0))

  /**
   * A realistic paired fixture: the fine-tune wins some examples and loses others.
   * `scale` multiplies every bucket, so the observed delta is held constant while
   * the sample size grows — which is exactly the thing significance depends on.
   */
  const winLoss = (
    { wins, losses, bothRight, bothWrong }: Record<string, number>,
    scale = 1,
  ): { base: number[]; tuned: number[] } => {
    const base: number[] = []
    const tuned: number[] = []
    const push = (b: number, t: number, n: number) => {
      for (let i = 0; i < n * scale; i += 1) {
        base.push(b)
        tuned.push(t)
      }
    }
    push(0, 1, wins!)
    push(1, 0, losses!)
    push(1, 1, bothRight!)
    push(0, 0, bothWrong!)
    return { base, tuned }
  }

  const narrowWin = { wins: 6, losses: 4, bothRight: 16, bothWrong: 14 } // n=40, delta +0.05

  it('is deterministic under a fixed seed', () => {
    const { base, tuned } = winLoss(narrowWin)

    const a = bootstrapDeltaCI(base, tuned, { iterations: 1000, seed: 12345 })
    const b = bootstrapDeltaCI(base, tuned, { iterations: 1000, seed: 12345 })

    expect(a).toEqual(b)
    expect(a.lower).toBe(b.lower)
    expect(a.upper).toBe(b.upper)
  })

  // Continuous scores, not 0/1: with binary scores on n=40 every resampled delta is a
  // multiple of 1/40, and two seeds routinely land on the identical percentile value.
  // That coarseness is real and fine — it just makes binary data a poor probe for
  // "did the seed actually change the resample stream".
  it('gives a different interval for a different seed but the same observed delta', () => {
    const rng = createRng(555)
    const base = Array.from({ length: 60 }, () => rng())
    const tuned = Array.from({ length: 60 }, () => rng())

    const a = bootstrapDeltaCI(base, tuned, { iterations: 1000, seed: 1 })
    const b = bootstrapDeltaCI(base, tuned, { iterations: 1000, seed: 2 })

    expect(a.observedDelta).toBe(b.observedDelta)
    expect([a.lower, a.upper]).not.toEqual([b.lower, b.upper])
  })

  it('is stable across seeds on binary scores, to within one score granule', () => {
    const { base, tuned } = winLoss(narrowWin)

    const a = bootstrapDeltaCI(base, tuned, { iterations: 1000, seed: 1 })
    const b = bootstrapDeltaCI(base, tuned, { iterations: 1000, seed: 2 })

    // Seed choice must not be able to flip the published verdict.
    expect(a.significant).toBe(b.significant)
    expect(Math.abs(a.lower - b.lower)).toBeLessThanOrEqual(1 / base.length)
    expect(Math.abs(a.upper - b.upper)).toBeLessThanOrEqual(1 / base.length)
  })

  it('reports the observed delta as the difference of the means', () => {
    const result = bootstrapDeltaCI([0, 0, 1, 1], [1, 1, 1, 1], { seed: 3 })
    expect(result.observedDelta).toBeCloseTo(0.5, 10)
  })

  it('collapses to a zero-width interval when every example improves identically', () => {
    const result = bootstrapDeltaCI(repeat(0, 40), repeat(1, 40), { seed: 5 })
    expect(result.lower).toBe(1)
    expect(result.upper).toBe(1)
    expect(result.significant).toBe(true)
  })

  it('is not significant when the two runs are identical', () => {
    const scores = binary(60, 33)
    const result = bootstrapDeltaCI(scores, scores, { seed: 5 })
    expect(result.observedDelta).toBe(0)
    expect(result.lower).toBe(0)
    expect(result.upper).toBe(0)
    expect(result.significant).toBe(false)
  })

  // THE headline statistical claim: a 5-point difference on 40 examples is noise.
  it('is NOT significant for a 5-point delta on 40 examples', () => {
    const { base, tuned } = winLoss(narrowWin) // 0.50 -> 0.55 on n=40
    const result = bootstrapDeltaCI(base, tuned, { seed: 12345 })

    expect(mean(base)).toBeCloseTo(0.5, 10)
    expect(mean(tuned)).toBeCloseTo(0.55, 10)
    expect(result.observedDelta).toBeCloseTo(0.05, 10)
    expect(result.significant).toBe(false)
    expect(result.lower).toBeLessThan(0)
    expect(result.upper).toBeGreaterThan(0)
  })

  it('IS significant for the same 5-point delta once the sample is large enough', () => {
    const { base, tuned } = winLoss(narrowWin, 100) // same delta, n=4000
    const result = bootstrapDeltaCI(base, tuned, { seed: 12345 })

    expect(result.exampleCount).toBe(4000)
    expect(result.observedDelta).toBeCloseTo(0.05, 10)
    expect(result.significant).toBe(true)
    expect(result.lower).toBeGreaterThan(0)
  })

  it('detects a significant regression (interval entirely below zero)', () => {
    const base = repeat(1, 50)
    const tuned = repeat(0, 50)
    const result = bootstrapDeltaCI(base, tuned, { seed: 8 })

    expect(result.observedDelta).toBe(-1)
    expect(result.upper).toBeLessThan(0)
    expect(result.significant).toBe(true)
  })

  it('uses a paired resample: the same example index is drawn for both runs', () => {
    // Perfectly anti-correlated runs whose per-example delta is a constant +1.
    // Only a PAIRED bootstrap can produce a zero-width interval here; an unpaired
    // one would resample base and tuned independently and show spread.
    const base = [0, 0, 0, 0, 0, 0, 0, 0]
    const tuned = [1, 1, 1, 1, 1, 1, 1, 1]
    const result = bootstrapDeltaCI(base, tuned, { seed: 4 })
    expect(result.lower).toBe(result.upper)
  })

  it('honours a custom confidence level, widening at 99%', () => {
    const base = binary(200, 100)
    const tuned = binary(200, 120)

    const at95 = bootstrapDeltaCI(base, tuned, { seed: 11, confidenceLevel: 0.95 })
    const at99 = bootstrapDeltaCI(base, tuned, { seed: 11, confidenceLevel: 0.99 })

    expect(at99.upper - at99.lower).toBeGreaterThan(at95.upper - at95.lower)
    expect(at99.confidenceLevel).toBe(0.99)
  })

  it('reports the settings it used so a passport reader can reproduce it', () => {
    const result = bootstrapDeltaCI([0, 1], [1, 1], { seed: 77, iterations: 250 })
    expect(result.iterations).toBe(250)
    expect(result.seed).toBe(77)
    expect(result.confidenceLevel).toBe(0.95)
    expect(result.method).toBe('paired-percentile-bootstrap')
  })

  it('throws when the two runs have different lengths', () => {
    expect(() => bootstrapDeltaCI([1, 0], [1], { seed: 1 })).toThrow(/same length/i)
  })

  it('returns a non-significant zero result for empty input instead of NaN', () => {
    const result = bootstrapDeltaCI([], [], { seed: 1 })
    expect(result.observedDelta).toBe(0)
    expect(result.significant).toBe(false)
    expect(Number.isNaN(result.lower)).toBe(false)
    expect(Number.isNaN(result.upper)).toBe(false)
  })

  it('is never significant on a single example, however large the delta', () => {
    const result = bootstrapDeltaCI([0], [1], { seed: 1 })
    expect(result.significant).toBe(false)
  })
})
