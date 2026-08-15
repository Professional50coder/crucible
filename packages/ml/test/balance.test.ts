import { describe, expect, it } from 'vitest'

import { classBalance } from '../src/analyze/balance.js'
import { normaliseRecords } from '../src/analyze/records.js'

const labelled = (label: string, i: number) => ({
  messages: [
    { role: 'user', content: `review number ${i} with some words in it` },
    { role: 'assistant', content: label },
  ],
})

const dataset = (spec: Record<string, number>) => {
  const records: unknown[] = []
  let i = 0
  for (const [label, count] of Object.entries(spec)) {
    for (let n = 0; n < count; n += 1) records.push(labelled(label, i++))
  }
  return normaliseRecords(records)
}

describe('classBalance — shape detection', () => {
  it('recognises a small set of short repeated outputs as classification', () => {
    expect(classBalance(dataset({ positive: 10, negative: 10 })).isClassificationShaped).toBe(true)
  })

  it('does not treat free-text answers as labels', () => {
    const records = normaliseRecords(
      Array.from({ length: 30 }, (_, i) => ({
        messages: [
          { role: 'user', content: `question ${i}` },
          {
            role: 'assistant',
            content: `a long free-form answer number ${i} that is clearly prose and not a class label at all`,
          },
        ],
      })),
    )
    expect(classBalance(records).isClassificationShaped).toBe(false)
  })

  it('does not treat all-unique short answers as labels', () => {
    const records = normaliseRecords(
      Array.from({ length: 30 }, (_, i) => ({
        messages: [
          { role: 'user', content: `q${i}` },
          { role: 'assistant', content: `ans${i}` },
        ],
      })),
    )
    expect(classBalance(records).isClassificationShaped).toBe(false)
  })

  it('is not classification-shaped for the text format, which has no answer side', () => {
    const records = normaliseRecords(Array.from({ length: 20 }, () => ({ text: 'a passage' })))
    expect(classBalance(records).isClassificationShaped).toBe(false)
  })

  it('handles an empty dataset', () => {
    const b = classBalance([])
    expect(b.isClassificationShaped).toBe(false)
    expect(b.classes).toEqual([])
  })
})

describe('classBalance — counts', () => {
  it('counts each label and its proportion', () => {
    const b = classBalance(dataset({ positive: 30, negative: 10 }))

    expect(b.classes).toHaveLength(2)
    const positive = b.classes.find((c) => c.label === 'positive')!
    expect(positive.count).toBe(30)
    expect(positive.proportion).toBeCloseTo(0.75, 10)
  })

  it('sorts classes from most to least frequent', () => {
    const b = classBalance(dataset({ rare: 2, common: 30, middling: 10 }))
    expect(b.classes.map((c) => c.label)).toEqual(['common', 'middling', 'rare'])
  })

  it('normalises label case and whitespace before counting', () => {
    const records = normaliseRecords([
      ...Array.from({ length: 5 }, (_, i) => labelled('Positive', i)),
      ...Array.from({ length: 5 }, (_, i) => labelled('  positive ', i + 100)),
    ])
    expect(classBalance(records).classes).toHaveLength(1)
  })
})

describe('classBalance — imbalance', () => {
  it('reports an imbalance ratio of majority over minority', () => {
    const b = classBalance(dataset({ a: 30, b: 10 }))
    expect(b.imbalanceRatio).toBeCloseTo(3, 10)
  })

  it('is balanced at ratio 1', () => {
    const b = classBalance(dataset({ a: 20, b: 20 }))
    expect(b.imbalanceRatio).toBe(1)
    expect(b.imbalanced).toBe(false)
  })

  it('flags a severe imbalance', () => {
    const b = classBalance(dataset({ a: 95, b: 5 }))
    expect(b.imbalanced).toBe(true)
    expect(b.imbalanceRatio).toBeCloseTo(19, 10)
  })

  // The single most useful number here: it tells you the accuracy a model gets by
  // ignoring the input entirely, which is the bar any eval result has to clear.
  it('reports the majority-class baseline accuracy', () => {
    const b = classBalance(dataset({ a: 90, b: 10 }))
    expect(b.majorityBaselineAccuracy).toBeCloseTo(0.9, 10)
    expect(b.majorityLabel).toBe('a')
  })

  it('names classes that are too rare to learn', () => {
    const b = classBalance(dataset({ common: 100, rare: 2 }))
    expect(b.underrepresented).toContain('rare')
    expect(b.underrepresented).not.toContain('common')
  })

  it('reports a single-class dataset as degenerate', () => {
    const b = classBalance(dataset({ only: 20 }))
    expect(b.classes).toHaveLength(1)
    expect(b.singleClass).toBe(true)
    expect(b.majorityBaselineAccuracy).toBe(1)
  })
})
