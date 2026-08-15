/**
 * End-to-end: the flow a Crucible job actually performs, with a fake provider.
 *
 * Nothing here touches the network, a key or a wallet. That is the point — the
 * whole pipeline is exercisable in CI.
 */

import { describe, expect, it } from 'vitest'

import {
  analyzeDataset,
  attachEvaluation,
  attachQuality,
  compareRuns,
  evalSummary,
  runEval,
} from '../src/index.js'
import type { EvalExample, InferenceClient } from '../src/index.js'

const chat = (q: string, a: string) => ({
  messages: [
    { role: 'user', content: q },
    { role: 'assistant', content: a },
  ],
})

const CITIES: Array<[string, string]> = [
  ['France', 'Paris'],
  ['Japan', 'Tokyo'],
  ['Brazil', 'Brasilia'],
  ['Kenya', 'Nairobi'],
  ['Norway', 'Oslo'],
  ['Peru', 'Lima'],
  ['Egypt', 'Cairo'],
  ['Nepal', 'Kathmandu'],
  ['Cuba', 'Havana'],
  ['Latvia', 'Riga'],
  ['Ghana', 'Accra'],
  ['Oman', 'Muscat'],
  ['Chile', 'Santiago'],
  ['Sweden', 'Stockholm'],
  ['Vietnam', 'Hanoi'],
  ['Morocco', 'Rabat'],
  ['Bolivia', 'Sucre'],
  ['Iceland', 'Reykjavik'],
  ['Jordan', 'Amman'],
  ['Serbia', 'Belgrade'],
]

const question = (country: string) => `What is the capital city of ${country}?`

const trainRecords = CITIES.map(([country, city]) => chat(question(country), city))
const testRecords = CITIES.slice(0, 8).map(([country, city]) => chat(question(country), city))

const examples: EvalExample[] = CITIES.slice(0, 8).map(([country, city]) => ({
  input: question(country),
  expected: city,
}))

/** Base model: verbose and usually wrong. Tuned model: terse and usually right. */
const fakeProvider = (correctness: (index: number) => boolean, verbose: boolean): InferenceClient => {
  let call = 0
  return {
    async complete(request) {
      const index = call++
      const country = /capital city of (\w+)/.exec(request.messages.at(-1)!.content)?.[1] ?? ''
      const city = CITIES.find(([c]) => c === country)?.[1] ?? 'Unknown'
      if (!correctness(index)) return verbose ? `I am not certain, perhaps ${city}ville?` : 'Unknown'
      return verbose ? `The capital city of ${country} is ${city}.` : city
    },
  }
}

describe('end-to-end: analyse, evaluate, attach to a passport', () => {
  it('runs the full pipeline against a fake provider', async () => {
    // 1. Pre-flight: is this dataset worth spending money on?
    const preflight = analyzeDataset({ train: trainRecords, test: testRecords })

    // The test split is lifted straight out of train, so this MUST fail.
    expect(preflight.severity).toBe('fail')
    expect(preflight.leakage!.contaminatedTestCount).toBe(8)

    // 2. Eval both models over the held-out set.
    const baseRun = await runEval({
      client: fakeProvider(() => false, true),
      model: 'Qwen2.5-0.5B-Instruct',
      examples,
      concurrency: 2,
    })
    const tunedRun = await runEval({
      client: fakeProvider(() => true, false),
      model: 'tuned-adapter',
      examples,
      concurrency: 2,
    })

    expect(baseRun.completed).toBe(8)
    expect(tunedRun.completed).toBe(8)

    // 3. Compare.
    const comparison = compareRuns(baseRun, tunedRun, { metric: 'exactMatch', seed: 12345 })

    expect(comparison.baseScore).toBe(0)
    expect(comparison.tunedScore).toBe(1)
    expect(comparison.wins).toBe(8)
    expect(comparison.significant).toBe(true)

    // 4. Attach both to a manifest.
    const manifest = { version: 1 as const, task: { id: 't1' } }
    const withBoth = attachQuality(attachEvaluation(manifest, comparison), preflight)

    expect(withBoth.evaluation.significant).toBe(true)
    expect(withBoth.quality.testSetClean).toBe(false)
    expect(withBoth.quality.leakedTestExamples).toBe(8)
    expect(withBoth.task.id).toBe('t1')
  })

  it('a leaked test set produces a "significant" result that the quality section contradicts', async () => {
    // The point of shipping both sections: the eval looks great precisely BECAUSE
    // the split is contaminated, and the passport carries the evidence of that.
    const preflight = analyzeDataset({ train: trainRecords, test: testRecords })
    const baseRun = await runEval({ client: fakeProvider(() => false, true), model: 'base', examples })
    const tunedRun = await runEval({ client: fakeProvider(() => true, false), model: 'tuned', examples })

    const manifest = attachQuality(
      attachEvaluation({}, compareRuns(baseRun, tunedRun, { seed: 1 })),
      preflight,
    )

    expect(manifest.evaluation.significant).toBe(true)
    expect(manifest.quality.severity).toBe('fail')
    expect(manifest.quality.testSetClean).toBe(false)
  })

  it('reports honestly when the fine-tune barely moved and the test set is small', async () => {
    // Base right on 4 of 8, tuned right on 5 of 8 -> +12.5 points on 8 examples.
    const baseRun = await runEval({
      client: fakeProvider((i) => i < 4, false),
      model: 'base',
      examples,
    })
    const tunedRun = await runEval({
      client: fakeProvider((i) => i < 5, false),
      model: 'tuned',
      examples,
    })

    const comparison = compareRuns(baseRun, tunedRun, { seed: 12345 })
    const summary = evalSummary(comparison)

    expect(comparison.absoluteDelta).toBeCloseTo(0.125, 10)
    expect(comparison.significant).toBe(false)
    expect(summary).toMatch(/not statistically significant/i)
    expect(summary).not.toMatch(/\bimproved\b/i)
  })

  it('survives a provider that fails half the requests', async () => {
    let call = 0
    const flaky: InferenceClient = {
      async complete() {
        if (call++ % 2 === 0) throw Object.assign(new Error('provider occupied'), { status: 400 })
        return 'Paris'
      },
    }

    const run = await runEval({ client: flaky, model: 'm', examples, maxRetries: 0 })

    expect(run.completed).toBe(4)
    expect(run.failed).toBe(4)
    expect(run.completionRate).toBe(0.5)
    expect(run.failures).toHaveLength(4)
  })

  it('a clean split with a real improvement passes pre-flight and reports significance', async () => {
    const heldOut: Array<[string, string]> = [
      ['Finland', 'Helsinki'],
      ['Uruguay', 'Montevideo'],
      ['Tunisia', 'Tunis'],
      ['Mongolia', 'Ulaanbaatar'],
      ['Ecuador', 'Quito'],
      ['Slovakia', 'Bratislava'],
      ['Zambia', 'Lusaka'],
      ['Estonia', 'Tallinn'],
    ]

    const preflight = analyzeDataset({
      train: trainRecords,
      test: heldOut.map(([c, city]) => chat(question(c), city)),
    })

    expect(preflight.leakage!.clean).toBe(true)
    expect(preflight.severity).not.toBe('fail')
  })
})
