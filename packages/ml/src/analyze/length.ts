/**
 * Length distribution.
 *
 * Two things go wrong with fine-tuning datasets and both show up here: a handful
 * of enormous records that will dominate the loss (and the bill), and a handful of
 * near-empty ones that teach the model to answer with nothing.
 *
 * Token counts are the ~4-chars-per-token estimate from `records.ts`, not a real
 * tokenizer. Good enough to spot an outlier by two orders of magnitude; not a
 * billing figure. Use the broker's `calculateToken` for money.
 */

import { percentile } from '../eval/statistics.js'
import type { NormalisedRecord } from './records.js'
import { estimateTokens } from './records.js'

/** Cap on listed outliers, so a wholly broken file still produces a readable report. */
const MAX_LISTED_OUTLIERS = 20

/** Standard Tukey fence multiplier. */
const IQR_MULTIPLIER = 1.5

/**
 * Practical fence: a record must be at least this many times longer (or shorter)
 * than the median before it is worth reporting, on top of failing the Tukey test.
 * Statistical outlyingness alone is too eager on small, tightly-clustered samples.
 */
const MEDIAN_RATIO = 3

export interface LengthSummary {
  min: number
  max: number
  mean: number
  median: number
  p95: number
}

export interface LengthOutlier {
  line: number
  tokens: number
  direction: 'short' | 'long'
}

export interface LengthDistribution extends LengthSummary {
  count: number
  totalTokens: number
  /** Prompt-side estimate (system + user turns, or instruction + input). */
  promptTokens: LengthSummary
  /** Answer-side estimate (assistant turn, or `output`). */
  completionTokens: LengthSummary
  /** At most MAX_LISTED_OUTLIERS entries, longest-first. */
  outliers: LengthOutlier[]
  /** How many outliers were found in total, whether or not they are listed. */
  outlierCount: number
  unit: 'estimated-tokens'
}

const EMPTY_SUMMARY: LengthSummary = { min: 0, max: 0, mean: 0, median: 0, p95: 0 }

function summarise(values: readonly number[]): LengthSummary {
  if (values.length === 0) return { ...EMPTY_SUMMARY }

  const sorted = [...values].sort((a, b) => a - b)
  const total = sorted.reduce((sum, v) => sum + v, 0)

  return {
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    mean: total / sorted.length,
    median: percentile(sorted, 50),
    p95: percentile(sorted, 95),
  }
}

export function lengthDistribution(records: readonly NormalisedRecord[]): LengthDistribution {
  const totals = records.map((r) => estimateTokens(r.full))
  const prompts = records.map((r) => estimateTokens(r.input))
  const completions = records.map((r) => estimateTokens(r.output))

  const summary = summarise(totals)

  // Tukey fences on the total-token distribution.
  const sorted = [...totals].sort((a, b) => a - b)
  const q1 = percentile(sorted, 25)
  const q3 = percentile(sorted, 75)
  const iqr = q3 - q1

  const allOutliers: LengthOutlier[] = []

  if (records.length >= 4) {
    // Practical fences: is this record far enough out to be worth a human look?
    // A dataset of tightly-clustered lengths will always produce Tukey outliers on
    // small samples, and reporting a record 20% longer than its neighbours as a
    // problem trains the user to ignore the report.
    const practicalLow = summary.median / MEDIAN_RATIO
    const practicalHigh = summary.median * MEDIAN_RATIO

    // Statistical fences. When the IQR is zero — most records the same length —
    // Tukey collapses onto that length and has nothing to say, so the practical
    // fences carry the decision alone. That case (uniform data plus one 100x
    // record) is exactly the one worth reporting.
    const statisticalLow = iqr > 0 ? q1 - IQR_MULTIPLIER * iqr : practicalLow
    const statisticalHigh = iqr > 0 ? q3 + IQR_MULTIPLIER * iqr : practicalHigh

    for (let i = 0; i < records.length; i += 1) {
      const tokens = totals[i]!
      if (tokens > statisticalHigh && tokens > practicalHigh) {
        allOutliers.push({ line: records[i]!.line, tokens, direction: 'long' })
      } else if (tokens < statisticalLow && tokens < practicalLow) {
        allOutliers.push({ line: records[i]!.line, tokens, direction: 'short' })
      }
    }
  }

  allOutliers.sort((a, b) => b.tokens - a.tokens || a.line - b.line)

  return {
    ...summary,
    count: records.length,
    totalTokens: totals.reduce((sum, v) => sum + v, 0),
    promptTokens: summarise(prompts),
    completionTokens: summarise(completions),
    outliers: allOutliers.slice(0, MAX_LISTED_OUTLIERS),
    outlierCount: allOutliers.length,
    unit: 'estimated-tokens',
  }
}
