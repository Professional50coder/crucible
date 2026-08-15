/**
 * compareRuns / evalSummary — turning two eval runs into a claim a passport can carry.
 *
 * This is the file where the product either keeps its promise or breaks it. A
 * provenance system that publishes "12% better!" off 40 test examples has produced
 * a number nobody can defend, and the whole thesis — that the passport is checkable
 * — dies with it. So:
 *
 *   - every comparison carries a bootstrap confidence interval on the delta;
 *   - `significant` is false unless that interval clears zero;
 *   - `evalSummary` is forbidden by test from using the word "improved" when
 *     `significant` is false.
 */

import type { ClassificationResult, Scorer, ScorerName } from './scorers.js'
import { SCORERS, classificationAccuracy } from './scorers.js'
import type { BootstrapResult } from './statistics.js'
import { DEFAULT_ITERATIONS, DEFAULT_SEED, bootstrapDeltaCI, mean } from './statistics.js'
import type { ChatMessage, EvalRun } from './types.js'

export interface ComparisonExample {
  index: number
  id?: string
  input: string | ChatMessage[]
  expected: string
  baseOutput: string
  tunedOutput: string
  baseScore: number
  tunedScore: number
}

export interface EvalComparison {
  metric: string
  /** 0..1 */
  baseScore: number
  /** 0..1 */
  tunedScore: number
  absoluteDelta: number
  /**
   * (tuned - base) / base. Zero when the base scored 0 — see `baselineZero`, which
   * is the flag to read before quoting this number.
   */
  relativeImprovement: number
  /** True when baseScore is 0, making a ratio undefined rather than large. */
  baselineZero: boolean
  /** Examples actually scored: both runs succeeded on them. */
  exampleCount: number
  /** Examples in the test set, before failures were excluded. */
  attemptedExampleCount: number
  /** Examples dropped because at least one run failed on them. */
  excludedForFailure: number
  wins: number
  losses: number
  ties: number
  confidenceInterval: { lower: number; upper: number }
  confidenceLevel: number
  significant: boolean
  /** True when the sample is too small for any significance claim at all. */
  underpowered: boolean
  bootstrap: BootstrapResult
  baseModel: string
  tunedModel: string
  perExample: ComparisonExample[]
  /** Only present for the classificationAccuracy metric. */
  classification?: { base: ClassificationResult; tuned: ClassificationResult }
}

export interface CompareOptions {
  /** A built-in scorer name, or any label when supplying `scorer`. */
  metric?: ScorerName | 'classificationAccuracy' | (string & {})
  /** Custom per-example scorer, overriding the named one. */
  scorer?: Scorer
  seed?: number
  iterations?: number
  confidenceLevel?: number
}

const isBuiltInScorer = (name: string): name is ScorerName => name in SCORERS

export function compareRuns(
  baseRun: EvalRun,
  tunedRun: EvalRun,
  options: CompareOptions = {},
): EvalComparison {
  const metric = options.metric ?? 'exactMatch'
  const seed = options.seed ?? DEFAULT_SEED
  const iterations = options.iterations ?? DEFAULT_ITERATIONS
  const confidenceLevel = options.confidenceLevel ?? 0.95

  if (baseRun.results.length !== tunedRun.results.length) {
    throw new Error(
      `compareRuns: both runs must cover the same test set, but base has ` +
        `${baseRun.results.length} results and tuned has ${tunedRun.results.length}. ` +
        `Comparing different test sets produces a meaningless delta.`,
    )
  }

  for (let i = 0; i < baseRun.results.length; i += 1) {
    const baseExpected = baseRun.results[i]!.expected
    const tunedExpected = tunedRun.results[i]!.expected
    if (baseExpected !== tunedExpected) {
      throw new Error(
        `compareRuns: the two runs disagree about the expected answer at index ${i} ` +
          `(base ${JSON.stringify(baseExpected)}, tuned ${JSON.stringify(tunedExpected)}). ` +
          `They were not run against the same test set.`,
      )
    }
  }

  const scorer: Scorer =
    options.scorer ??
    (isBuiltInScorer(metric)
      ? SCORERS[metric]
      : metric === 'classificationAccuracy'
        ? SCORERS.exactMatch // per-example agreement; aggregates added below
        : (() => {
            throw new Error(
              `compareRuns: unknown metric "${metric}". Pass a custom \`scorer\`, or use ` +
                `one of: ${[...Object.keys(SCORERS), 'classificationAccuracy'].join(', ')}.`,
            )
          })())

  const perExample: ComparisonExample[] = []

  for (let i = 0; i < baseRun.results.length; i += 1) {
    const baseResult = baseRun.results[i]!
    const tunedResult = tunedRun.results[i]!

    // A failed request is not a wrong answer. Scoring it as 0 would silently
    // penalise whichever model happened to hit a flaky provider.
    if (!baseResult.ok || !tunedResult.ok) continue

    const baseOutput = baseResult.output ?? ''
    const tunedOutput = tunedResult.output ?? ''

    perExample.push({
      index: i,
      ...(baseResult.id === undefined ? {} : { id: baseResult.id }),
      input: baseResult.input,
      expected: baseResult.expected,
      baseOutput,
      tunedOutput,
      baseScore: scorer(baseOutput, baseResult.expected),
      tunedScore: scorer(tunedOutput, tunedResult.expected),
    })
  }

  const baseScores = perExample.map((p) => p.baseScore)
  const tunedScores = perExample.map((p) => p.tunedScore)

  const baseScore = mean(baseScores)
  const tunedScore = mean(tunedScores)
  const absoluteDelta = tunedScore - baseScore
  const baselineZero = baseScore === 0

  let wins = 0
  let losses = 0
  let ties = 0
  for (const row of perExample) {
    if (row.tunedScore > row.baseScore) wins += 1
    else if (row.tunedScore < row.baseScore) losses += 1
    else ties += 1
  }

  const bootstrap = bootstrapDeltaCI(baseScores, tunedScores, {
    seed,
    iterations,
    confidenceLevel,
  })

  const comparison: EvalComparison = {
    metric,
    baseScore,
    tunedScore,
    absoluteDelta,
    relativeImprovement: baselineZero ? 0 : absoluteDelta / baseScore,
    baselineZero,
    exampleCount: perExample.length,
    attemptedExampleCount: baseRun.results.length,
    excludedForFailure: baseRun.results.length - perExample.length,
    wins,
    losses,
    ties,
    confidenceInterval: { lower: bootstrap.lower, upper: bootstrap.upper },
    confidenceLevel,
    significant: bootstrap.significant,
    underpowered: bootstrap.underpowered,
    bootstrap,
    baseModel: baseRun.model,
    tunedModel: tunedRun.model,
    perExample,
  }

  if (metric === 'classificationAccuracy') {
    comparison.classification = {
      base: classificationAccuracy(
        perExample.map((p) => ({ output: p.baseOutput, expected: p.expected })),
      ),
      tuned: classificationAccuracy(
        perExample.map((p) => ({ output: p.tunedOutput, expected: p.expected })),
      ),
    }
  }

  return comparison
}

const fixed2 = (n: number): string => n.toFixed(2)
const points = (n: number): string => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}`

/**
 * One human sentence for the passport UI.
 *
 * The only hard rule, enforced by test: when `significant` is false this sentence
 * must not say the model improved. It may say what was measured; it may not
 * assert a conclusion the data does not support.
 */
export function evalSummary(comparison: EvalComparison): string {
  const {
    metric,
    baseScore,
    tunedScore,
    absoluteDelta,
    exampleCount,
    excludedForFailure,
    significant,
    underpowered,
    confidenceInterval,
    confidenceLevel,
    wins,
    losses,
  } = comparison

  if (exampleCount === 0) {
    return (
      `No examples could be scored for ${metric}: every test example failed in at ` +
      `least one of the two runs, so no comparison was possible.`
    )
  }

  const percent = Math.round(confidenceLevel * 100)
  const ci =
    `${percent}% CI [${confidenceInterval.lower.toFixed(3)}, ` +
    `${confidenceInterval.upper.toFixed(3)}]`

  const head =
    `Fine-tuned model scored ${fixed2(tunedScore)} vs ${fixed2(baseScore)} for the base ` +
    `on ${metric} across ${exampleCount} examples`

  const dropped =
    excludedForFailure > 0
      ? ` (${excludedForFailure} further example${excludedForFailure === 1 ? '' : 's'} ` +
        `excluded after request failures)`
      : ''

  if (underpowered) {
    return (
      `${head}${dropped}: ${points(absoluteDelta)} points, ${ci} — but ${exampleCount} ` +
      `example${exampleCount === 1 ? '' : 's'} is too small a test set to support any ` +
      `claim either way.`
    )
  }

  if (absoluteDelta === 0) {
    return (
      `${head}${dropped}: no measurable difference on this test set ` +
      `(${wins} win${wins === 1 ? '' : 's'}, ${losses} loss${losses === 1 ? '' : 'es'}, ${ci}).`
    )
  }

  if (!significant) {
    return (
      `${head}${dropped}: a ${points(absoluteDelta)}-point difference that is ` +
      `not statistically significant at ${percent}% confidence — ${ci} includes zero, ` +
      `so this test set cannot distinguish the two models.`
    )
  }

  if (absoluteDelta < 0) {
    return (
      `${head}${dropped}: a statistically significant regression of ` +
      `${points(absoluteDelta)} points (${ci}) — the fine-tune made the model worse ` +
      `on this test set.`
    )
  }

  return (
    `${head}${dropped}: a statistically significant improvement of ` +
    `${points(absoluteDelta)} points (${ci}), winning ${wins} and losing ${losses} ` +
    `example${losses === 1 ? '' : 's'}.`
  )
}
