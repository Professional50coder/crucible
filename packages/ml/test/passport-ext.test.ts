import { describe, expect, it } from 'vitest'

import { analyzeDataset } from '../src/analyze/report.js'
import { compareRuns } from '../src/eval/compare.js'
import type { EvalItemResult, EvalRun } from '../src/eval/types.js'
import {
  attachEvaluation,
  attachQuality,
  buildEvalSection,
  buildQualitySection,
} from '../src/passport-ext.js'

/** A manifest matching INTERFACES.md §1, structurally — core is not imported. */
const manifest = () => ({
  version: 1 as const,
  network: 'mainnet' as const,
  chainId: 16661,
  createdAt: '2026-08-14T12:00:00.000Z',
  task: {
    id: 'task-123',
    provider: '0x940b4a101CaBa9be04b16A7363cafa29C1660B0d',
    state: 'Finished',
  },
  base: {
    model: 'Qwen2.5-0.5B-Instruct',
    modelHash: '0xb4f76a886b8655c92bb021922d60b5e4d9271a5c9da98b6cb10937a06c2c75a7',
    tokenizer: 'Qwen/Qwen2.5-0.5B-Instruct',
  },
  dataset: { rootHash: '0xaaa', format: 'chat' as const, exampleCount: 30, tokenCount: 900 },
  training: {
    neftune_noise_alpha: 5,
    num_train_epochs: 3,
    per_device_train_batch_size: 2,
    learning_rate: 0.0002,
    max_steps: 45,
  },
  adapter: { rootHash: '0xbbb', sizeBytes: 104857600 },
  fee: { trainingNeuron: '1', storageReserveNeuron: '2', totalNeuron: '3' },
  tee: { signerAddress: '0x24135b4Bd964872284728F79F5f17eB874C5583A', acknowledged: true, attestationVerified: true },
})

const makeRun = (model: string, rows: Array<[string, string]>): EvalRun => {
  const results: EvalItemResult[] = rows.map(([expected, output], index) => ({
    index,
    input: `q${index}`,
    expected,
    output,
    ok: true,
    error: null,
    attempts: 1,
    latencyMs: 1,
  }))
  return {
    model,
    exampleCount: rows.length,
    completed: rows.length,
    failed: 0,
    completionRate: 1,
    results,
    failures: [],
    totalAttempts: rows.length,
    durationMs: 100,
  }
}

const comparison = (n = 60, tunedWins = true) => {
  const base = makeRun('Qwen2.5-0.5B-Instruct', Array.from({ length: n }, (_, i): [string, string] => [`a${i}`, 'wrong']))
  const tuned = makeRun('tuned', Array.from({ length: n }, (_, i): [string, string] => [`a${i}`, tunedWins ? `a${i}` : 'wrong']))
  return compareRuns(base, tuned, { seed: 12345 })
}

const noisyComparison = () => {
  // 6 wins, 4 losses on 40 -> +5 points, not significant
  const rows = Array.from({ length: 40 }, (_, i) => i)
  const base = makeRun(
    'base',
    rows.map((i): [string, string] => [`a${i}`, i < 6 ? 'wrong' : i < 10 ? `a${i}` : i < 26 ? `a${i}` : 'wrong']),
  )
  const tuned = makeRun(
    'tuned',
    rows.map((i): [string, string] => [`a${i}`, i < 6 ? `a${i}` : i < 10 ? 'wrong' : i < 26 ? `a${i}` : 'wrong']),
  )
  return compareRuns(base, tuned, { seed: 12345 })
}

describe('buildEvalSection', () => {
  it('carries the headline numbers', () => {
    const section = buildEvalSection(comparison())

    expect(section.metric).toBe('exactMatch')
    expect(section.baseScore).toBe(0)
    expect(section.tunedScore).toBe(1)
    expect(section.absoluteDelta).toBe(1)
    expect(section.exampleCount).toBe(60)
  })

  it('carries the significance verdict and interval', () => {
    const section = buildEvalSection(comparison())

    expect(section.significant).toBe(true)
    expect(section.confidenceInterval.lower).toBeDefined()
    expect(section.confidenceLevel).toBe(0.95)
  })

  it('records the seed and iteration count so the interval is reproducible', () => {
    const section = buildEvalSection(comparison())
    expect(section.bootstrapSeed).toBe(12345)
    expect(section.bootstrapIterations).toBe(1000)
    expect(section.method).toBe('paired-percentile-bootstrap')
  })

  it('includes the human summary and it does not overclaim', () => {
    const section = buildEvalSection(noisyComparison())
    expect(section.significant).toBe(false)
    expect(section.summary).toMatch(/not statistically significant/i)
  })

  // A manifest gets canonicalised and keccak-hashed. Long floats are a portability
  // risk in that pipeline, so numbers are rounded at the boundary.
  it('rounds every number to a fixed precision for stable hashing', () => {
    const section = buildEvalSection(noisyComparison())

    for (const value of [
      section.baseScore,
      section.tunedScore,
      section.absoluteDelta,
      section.relativeImprovement,
      section.confidenceInterval.lower,
      section.confidenceInterval.upper,
    ]) {
      expect(Number.isFinite(value)).toBe(true)
      expect(String(value).replace(/^-?\d*\.?/, '').length).toBeLessThanOrEqual(6)
    }
  })

  it('does NOT embed the full per-example table', () => {
    const section = buildEvalSection(comparison()) as unknown as Record<string, unknown>
    expect(section['perExample']).toBeUndefined()
  })

  it('embeds a digest of the per-example detail so it can be published separately', () => {
    const section = buildEvalSection(comparison())
    expect(section.perExampleDigest).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('gives the same digest for the same detail and a different one otherwise', () => {
    expect(buildEvalSection(comparison()).perExampleDigest).toBe(
      buildEvalSection(comparison()).perExampleDigest,
    )
    expect(buildEvalSection(comparison()).perExampleDigest).not.toBe(
      buildEvalSection(noisyComparison()).perExampleDigest,
    )
  })

  it('contains no undefined values, which would break canonicalisation', () => {
    const section = buildEvalSection(comparison())
    expect(JSON.stringify(section)).not.toContain('undefined')
    for (const value of Object.values(section)) expect(value).not.toBeUndefined()
  })
})

describe('attachEvaluation', () => {
  it('returns a NEW manifest with an evaluation field', () => {
    const original = manifest()
    const next = attachEvaluation(original, comparison())

    expect(next).not.toBe(original)
    expect(next.evaluation).toBeDefined()
    expect(next.evaluation.significant).toBe(true)
  })

  it('does not mutate the input manifest', () => {
    const original = manifest()
    const snapshot = JSON.stringify(original)
    attachEvaluation(original, comparison())
    expect(JSON.stringify(original)).toBe(snapshot)
  })

  it('preserves every existing field untouched', () => {
    const original = manifest()
    const next = attachEvaluation(original, comparison())

    expect(next.task).toEqual(original.task)
    expect(next.base).toEqual(original.base)
    expect(next.training).toEqual(original.training)
    expect(next.fee).toEqual(original.fee)
  })

  it('replaces a previously attached evaluation rather than nesting one', () => {
    const once = attachEvaluation(manifest(), comparison())
    const twice = attachEvaluation(once, noisyComparison())

    expect(twice.evaluation.significant).toBe(false)
    expect(Object.keys(twice).filter((k) => k === 'evaluation')).toHaveLength(1)
  })
})

describe('buildQualitySection', () => {
  const chat = (q: string, a: string) => ({
    messages: [
      { role: 'user', content: q },
      { role: 'assistant', content: a },
    ],
  })

  const topics = [
    'photosynthesis converts sunlight into chemical energy inside chloroplasts',
    'the treaty of westphalia ended the thirty years war in europe',
    'a binary search halves the remaining interval on every iteration',
    'humpback whales migrate thousands of kilometres to breeding grounds',
    'the maillard reaction browns food and creates hundreds of flavour compounds',
    'plate tectonics explains earthquakes volcanoes and mountain formation',
    'compound interest grows principal exponentially rather than linearly',
    'the printing press dramatically lowered the cost of reproducing books',
    'antibiotics are ineffective against viral infections such as influenza',
    'a suspension bridge carries load through tension in its main cables',
    'the doppler effect shifts observed frequency for a moving source',
    'mycorrhizal fungi exchange nutrients with plant roots underground',
  ]

  const train = topics.map((q, i) => chat(q, `answer ${i}`))

  it('summarises the report without copying the whole thing', () => {
    const section = buildQualitySection(analyzeDataset({ train }))

    expect(section.severity).toBe('warn')
    expect(section.exampleCount).toBe(12)
    expect(section.exactDuplicateCount).toBe(0)
    expect(section.piiFindingCount).toBe(0)
  })

  it('records the leakage verdict, which is the load-bearing one', () => {
    const test = [chat(topics[0]!, 'answer 0')]
    const section = buildQualitySection(analyzeDataset({ train, test }))

    expect(section.leakageChecked).toBe(true)
    expect(section.leakedTestExamples).toBe(1)
    expect(section.testSetClean).toBe(false)
  })

  it('marks leakage as unchecked when no test set was analysed', () => {
    const section = buildQualitySection(analyzeDataset({ train }))

    expect(section.leakageChecked).toBe(false)
    expect(section.testSetClean).toBe(false)
    expect(section.leakedTestExamples).toBe(0)
  })

  it('carries issue codes but not free-text recommendations', () => {
    const section = buildQualitySection(analyzeDataset({ train })) as unknown as Record<string, unknown>

    expect(Array.isArray(section['issueCodes'])).toBe(true)
    expect(section['recommendations']).toBeUndefined()
  })

  it('never carries a PII sample into the manifest', () => {
    const key = `0x${'a1b2c3d4'.repeat(8)}`
    const withSecret = [...train, chat('deploy', key)]
    const section = buildQualitySection(analyzeDataset({ train: withSecret }))

    expect(JSON.stringify(section)).not.toContain(key)
    expect(JSON.stringify(section)).not.toContain('a1b2c3d4')
    expect(section.piiHighSeverityCount).toBe(1)
  })

  it('contains no undefined values', () => {
    const section = buildQualitySection(analyzeDataset({ train }))
    for (const value of Object.values(section)) expect(value).not.toBeUndefined()
  })
})

describe('attachQuality', () => {
  const chat = (q: string, a: string) => ({
    messages: [
      { role: 'user', content: q },
      { role: 'assistant', content: a },
    ],
  })
  const train = Array.from({ length: 12 }, (_, i) =>
    chat(`a distinct question ${'xyz'.repeat(i + 1)} number ${i}`, `answer ${i}`),
  )

  it('returns a new manifest with a quality field', () => {
    const original = manifest()
    const next = attachQuality(original, analyzeDataset({ train }))

    expect(next).not.toBe(original)
    expect(next.quality.severity).toBeDefined()
  })

  it('does not mutate the input', () => {
    const original = manifest()
    const snapshot = JSON.stringify(original)
    attachQuality(original, analyzeDataset({ train }))
    expect(JSON.stringify(original)).toBe(snapshot)
  })

  it('composes with attachEvaluation, keeping both sections', () => {
    const next = attachQuality(attachEvaluation(manifest(), comparison()), analyzeDataset({ train }))

    expect(next.evaluation).toBeDefined()
    expect(next.quality).toBeDefined()
    expect(next.base.model).toBe('Qwen2.5-0.5B-Instruct')
  })

  it('leaves the manifest JSON-serialisable', () => {
    const next = attachQuality(attachEvaluation(manifest(), comparison()), analyzeDataset({ train }))
    expect(() => JSON.stringify(next)).not.toThrow()
    expect(JSON.parse(JSON.stringify(next)).evaluation.significant).toBe(true)
  })
})
