import { describe, expect, it } from 'vitest'

import { compareRuns, evalSummary } from '../src/eval/compare.js'
import type { EvalItemResult, EvalRun } from '../src/eval/types.js'

/** Build an EvalRun from a list of [expected, output] pairs; null output = failure. */
const makeRun = (model: string, rows: Array<[string, string | null]>): EvalRun => {
  const results: EvalItemResult[] = rows.map(([expected, output], index) => ({
    index,
    input: `q${index}`,
    expected,
    output,
    ok: output !== null,
    error: output === null ? 'request failed' : null,
    attempts: 1,
    latencyMs: 1,
  }))

  const failed = results.filter((r) => !r.ok).length

  return {
    model,
    exampleCount: rows.length,
    completed: rows.length - failed,
    failed,
    completionRate: rows.length === 0 ? 0 : (rows.length - failed) / rows.length,
    results,
    failures: results
      .filter((r) => !r.ok)
      .map((r) => ({ index: r.index, error: r.error!, attempts: 1 })),
    totalAttempts: rows.length,
    durationMs: 10,
  }
}

/** n examples where the base gets `baseRight` correct and the tuned gets `tunedRight`. */
const pairedRuns = (rows: Array<[boolean, boolean]>) => {
  const base = makeRun(
    'base',
    rows.map(([b], i): [string, string] => [`a${i}`, b ? `a${i}` : 'wrong']),
  )
  const tuned = makeRun(
    'tuned',
    rows.map(([, t], i): [string, string] => [`a${i}`, t ? `a${i}` : 'wrong']),
  )
  return { base, tuned }
}

describe('compareRuns — core numbers', () => {
  const rows: Array<[boolean, boolean]> = [
    [true, true], // tie (both right)
    [false, true], // win
    [false, true], // win
    [true, false], // loss
    [false, false], // tie (both wrong)
  ]

  it('scores each run as the mean per-example score', () => {
    const { base, tuned } = pairedRuns(rows)
    const c = compareRuns(base, tuned, { metric: 'exactMatch' })

    expect(c.baseScore).toBeCloseTo(2 / 5, 10)
    expect(c.tunedScore).toBeCloseTo(3 / 5, 10)
  })

  it('reports the absolute delta', () => {
    const { base, tuned } = pairedRuns(rows)
    const c = compareRuns(base, tuned, { metric: 'exactMatch' })
    expect(c.absoluteDelta).toBeCloseTo(0.2, 10)
  })

  it('counts wins, losses and ties', () => {
    const { base, tuned } = pairedRuns(rows)
    const c = compareRuns(base, tuned, { metric: 'exactMatch' })

    expect(c.wins).toBe(2)
    expect(c.losses).toBe(1)
    expect(c.ties).toBe(2)
    expect(c.wins + c.losses + c.ties).toBe(c.exampleCount)
  })

  it('names the metric it used', () => {
    const { base, tuned } = pairedRuns(rows)
    expect(compareRuns(base, tuned, { metric: 'tokenF1' }).metric).toBe('tokenF1')
  })

  it('defaults to exactMatch', () => {
    const { base, tuned } = pairedRuns(rows)
    expect(compareRuns(base, tuned).metric).toBe('exactMatch')
  })

  it('emits a per-example row carrying both outputs and both scores', () => {
    const { base, tuned } = pairedRuns(rows)
    const c = compareRuns(base, tuned, { metric: 'exactMatch' })

    expect(c.perExample).toHaveLength(5)
    expect(c.perExample[1]).toMatchObject({
      index: 1,
      input: 'q1',
      expected: 'a1',
      baseOutput: 'wrong',
      tunedOutput: 'a1',
      baseScore: 0,
      tunedScore: 1,
    })
  })

  it('accepts a custom scorer function', () => {
    const { base, tuned } = pairedRuns(rows)
    const c = compareRuns(base, tuned, { metric: 'alwaysHalf', scorer: () => 0.5 })

    expect(c.baseScore).toBe(0.5)
    expect(c.tunedScore).toBe(0.5)
    expect(c.absoluteDelta).toBe(0)
    expect(c.metric).toBe('alwaysHalf')
  })
})

describe('compareRuns — relative improvement', () => {
  it('is delta / baseScore in the normal case', () => {
    const { base, tuned } = pairedRuns([
      [true, true],
      [true, true],
      [false, true],
      [false, true],
    ])
    // base 0.5 -> tuned 1.0, delta 0.5, relative 1.0
    const c = compareRuns(base, tuned)
    expect(c.relativeImprovement).toBeCloseTo(1, 10)
    expect(c.baselineZero).toBe(false)
  })

  it('does not divide by zero when the base model scores 0', () => {
    const { base, tuned } = pairedRuns([
      [false, true],
      [false, true],
      [false, false],
    ])
    const c = compareRuns(base, tuned)

    expect(c.baseScore).toBe(0)
    expect(Number.isFinite(c.relativeImprovement)).toBe(true)
    expect(c.relativeImprovement).toBe(0)
    expect(c.baselineZero).toBe(true)
  })

  it('flags baselineZero even when both models score 0', () => {
    const { base, tuned } = pairedRuns([
      [false, false],
      [false, false],
    ])
    const c = compareRuns(base, tuned)
    expect(c.relativeImprovement).toBe(0)
    expect(c.baselineZero).toBe(true)
  })

  it('reports a negative relative improvement for a regression', () => {
    const { base, tuned } = pairedRuns([
      [true, false],
      [true, false],
      [true, true],
      [true, true],
    ])
    // base 1.0 -> tuned 0.5
    const c = compareRuns(base, tuned)
    expect(c.relativeImprovement).toBeCloseTo(-0.5, 10)
  })
})

describe('compareRuns — statistical honesty', () => {
  const many = (n: number, pattern: (i: number) => [boolean, boolean]) =>
    pairedRuns(Array.from({ length: n }, (_, i) => pattern(i)))

  it('attaches a confidence interval and a significance verdict', () => {
    const { base, tuned } = many(40, (i) => [i < 20, i < 22])
    const c = compareRuns(base, tuned, { seed: 12345 })

    expect(c.confidenceInterval.lower).toBeLessThanOrEqual(c.absoluteDelta)
    expect(c.confidenceInterval.upper).toBeGreaterThanOrEqual(c.absoluteDelta)
    expect(typeof c.significant).toBe('boolean')
    expect(c.confidenceLevel).toBe(0.95)
    expect(c.bootstrap.method).toBe('paired-percentile-bootstrap')
  })

  it('is not significant for a 5-point delta on 40 examples', () => {
    // 6 wins, 4 losses, net +2/40 = +5 points
    const { base, tuned } = many(40, (i) => {
      if (i < 6) return [false, true]
      if (i < 10) return [true, false]
      if (i < 26) return [true, true]
      return [false, false]
    })
    const c = compareRuns(base, tuned, { seed: 12345 })

    expect(c.absoluteDelta).toBeCloseTo(0.05, 10)
    expect(c.significant).toBe(false)
  })

  it('is significant when every example improves', () => {
    const { base, tuned } = many(40, () => [false, true])
    const c = compareRuns(base, tuned, { seed: 12345 })

    expect(c.absoluteDelta).toBe(1)
    expect(c.significant).toBe(true)
  })

  it('is deterministic under a fixed seed', () => {
    const { base, tuned } = many(40, (i) => [i % 2 === 0, i % 3 !== 0])
    const a = compareRuns(base, tuned, { seed: 7 })
    const b = compareRuns(base, tuned, { seed: 7 })
    expect(a.confidenceInterval).toEqual(b.confidenceInterval)
    expect(a.significant).toBe(b.significant)
  })
})

describe('compareRuns — partial failure', () => {
  it('excludes examples that failed in either run and says how many', () => {
    const base = makeRun('base', [
      ['a0', 'a0'],
      ['a1', 'a1'],
      ['a2', null], // base failed
      ['a3', 'a3'],
    ])
    const tuned = makeRun('tuned', [
      ['a0', 'a0'],
      ['a1', null], // tuned failed
      ['a2', 'a2'],
      ['a3', 'a3'],
    ])

    const c = compareRuns(base, tuned)

    expect(c.exampleCount).toBe(2)
    expect(c.excludedForFailure).toBe(2)
    expect(c.attemptedExampleCount).toBe(4)
    expect(c.perExample.map((p) => p.index)).toEqual([0, 3])
  })

  it('reports a comparison of zero examples rather than throwing when everything failed', () => {
    const base = makeRun('base', [['a0', null]])
    const tuned = makeRun('tuned', [['a0', null]])
    const c = compareRuns(base, tuned)

    expect(c.exampleCount).toBe(0)
    expect(c.significant).toBe(false)
    expect(Number.isNaN(c.baseScore)).toBe(false)
    expect(c.baseScore).toBe(0)
  })

  it('refuses to compare runs of different lengths', () => {
    const base = makeRun('base', [['a', 'a']])
    const tuned = makeRun('tuned', [
      ['a', 'a'],
      ['b', 'b'],
    ])
    expect(() => compareRuns(base, tuned)).toThrow(/same test set|length/i)
  })

  it('refuses to compare runs whose expected answers disagree at an index', () => {
    const base = makeRun('base', [
      ['a', 'a'],
      ['b', 'b'],
    ])
    const tuned = makeRun('tuned', [
      ['a', 'a'],
      ['DIFFERENT', 'x'],
    ])
    expect(() => compareRuns(base, tuned)).toThrow(/index 1/i)
  })
})

describe('compareRuns — classification metric', () => {
  it('attaches a per-class breakdown and confusion matrix for both runs', () => {
    const base = makeRun('base', [
      ['positive', 'negative'],
      ['positive', 'positive'],
      ['negative', 'negative'],
      ['negative', 'positive'],
    ])
    const tuned = makeRun('tuned', [
      ['positive', 'positive'],
      ['positive', 'positive'],
      ['negative', 'negative'],
      ['negative', 'positive'],
    ])

    const c = compareRuns(base, tuned, { metric: 'classificationAccuracy' })

    expect(c.baseScore).toBeCloseTo(0.5, 10)
    expect(c.tunedScore).toBeCloseTo(0.75, 10)
    expect(c.classification).toBeDefined()
    expect(c.classification!.base.labels).toEqual(['negative', 'positive'])
    expect(c.classification!.tuned.accuracy).toBeCloseTo(0.75, 10)
    expect(c.classification!.tuned.confusion).toHaveLength(2)
  })

  it('leaves classification undefined for non-label metrics', () => {
    const { base, tuned } = pairedRuns([[true, true]])
    expect(compareRuns(base, tuned, { metric: 'tokenF1' }).classification).toBeUndefined()
  })
})

describe('evalSummary', () => {
  const summaryFor = (rows: Array<[boolean, boolean]>, seed = 12345) => {
    const { base, tuned } = pairedRuns(rows)
    return evalSummary(compareRuns(base, tuned, { seed }))
  }

  const nOf = (n: number, pattern: (i: number) => [boolean, boolean]) =>
    Array.from({ length: n }, (_, i) => pattern(i))

  it('does NOT claim improvement when the result is not significant', () => {
    const summary = summaryFor(
      nOf(40, (i) => {
        if (i < 6) return [false, true]
        if (i < 10) return [true, false]
        if (i < 26) return [true, true]
        return [false, false]
      }),
    )

    expect(summary).toMatch(/not statistically significant/i)
    expect(summary).not.toMatch(/\bimproved\b/i)
    expect(summary).toMatch(/40 examples/)
  })

  it('claims a significant improvement when the interval clears zero', () => {
    const summary = summaryFor(nOf(60, () => [false, true]))

    expect(summary).toMatch(/significant/i)
    expect(summary).not.toMatch(/not statistically significant/i)
    expect(summary).toMatch(/improve/i)
  })

  it('names a significant regression as a regression, not an improvement', () => {
    const summary = summaryFor(nOf(60, () => [true, false]))

    expect(summary).toMatch(/regress|worse/i)
    expect(summary).not.toMatch(/improve/i)
  })

  it('reports both scores and the metric name', () => {
    const summary = summaryFor(nOf(60, () => [false, true]))
    expect(summary).toMatch(/exactMatch/)
    expect(summary).toMatch(/0\.00/)
    expect(summary).toMatch(/1\.00/)
  })

  it('always includes the confidence interval so the claim can be checked', () => {
    const summary = summaryFor(nOf(40, (i) => [i < 20, i < 30]))
    expect(summary).toMatch(/95% CI/)
  })

  it('says a flat result is flat', () => {
    const summary = summaryFor(nOf(40, (i) => [i < 20, i < 20]))
    expect(summary).toMatch(/no measurable (difference|change)/i)
  })

  it('warns instead of scoring when there were no comparable examples', () => {
    const base = makeRun('base', [['a', null]])
    const tuned = makeRun('tuned', [['a', null]])
    const summary = evalSummary(compareRuns(base, tuned))

    expect(summary).toMatch(/no examples/i)
    expect(summary).not.toMatch(/improve/i)
  })

  it('flags an underpowered sample explicitly', () => {
    const summary = summaryFor(nOf(3, () => [false, true]))
    expect(summary).toMatch(/too small|underpowered/i)
  })

  it('is a single line', () => {
    const summary = summaryFor(nOf(40, (i) => [i < 20, i < 30]))
    expect(summary).not.toContain('\n')
  })
})
