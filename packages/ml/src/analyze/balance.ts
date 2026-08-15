/**
 * Class balance for classification-shaped datasets.
 *
 * The number that earns this module's place is `majorityBaselineAccuracy`: the
 * score a model gets by ignoring the input and always guessing the most common
 * label. On a 90/10 split that is 0.90, which means a fine-tune reporting "90%
 * accuracy" has demonstrated nothing at all. Publishing that number in a passport
 * without the baseline beside it would be the same category of mistake as
 * publishing an improvement that is inside the noise.
 */

import type { NormalisedRecord } from './records.js'

/** Longest output still plausibly a class label rather than prose. */
const MAX_LABEL_LENGTH = 64

/** A dataset is label-shaped only if distinct outputs are few relative to its size. */
const MAX_DISTINCT_LABELS = 20
const MIN_RECORDS_PER_LABEL = 2

/** Majority:minority ratio at or above which we call the dataset imbalanced. */
export const IMBALANCE_RATIO_THRESHOLD = 3

/** Classes with fewer than this many examples cannot realistically be learned. */
export const MIN_EXAMPLES_PER_CLASS = 5

const normalise = (text: string): string => text.trim().toLowerCase().replace(/\s+/g, ' ')

export interface ClassCount {
  label: string
  count: number
  proportion: number
  lines: number[]
}

export interface ClassBalance {
  isClassificationShaped: boolean
  classes: ClassCount[]
  distinctLabels: number
  /** majority count / minority count. 1 when perfectly balanced, 0 when not applicable. */
  imbalanceRatio: number
  imbalanced: boolean
  singleClass: boolean
  majorityLabel: string | null
  /** Accuracy obtainable by always predicting the majority label. The bar to beat. */
  majorityBaselineAccuracy: number
  /** Labels with fewer than MIN_EXAMPLES_PER_CLASS examples. */
  underrepresented: string[]
  exampleCount: number
}

const EMPTY: ClassBalance = {
  isClassificationShaped: false,
  classes: [],
  distinctLabels: 0,
  imbalanceRatio: 0,
  imbalanced: false,
  singleClass: false,
  majorityLabel: null,
  majorityBaselineAccuracy: 0,
  underrepresented: [],
  exampleCount: 0,
}

export function classBalance(records: readonly NormalisedRecord[]): ClassBalance {
  if (records.length === 0) return { ...EMPTY }

  // The text format has no answer side, so there is nothing to infer a label from.
  const withOutputs = records.filter((r) => r.output.trim() !== '')
  if (withOutputs.length === 0) return { ...EMPTY, exampleCount: records.length }

  const counts = new Map<string, number[]>()
  for (const record of withOutputs) {
    const label = normalise(record.output)
    const lines = counts.get(label)
    if (lines === undefined) counts.set(label, [record.line])
    else lines.push(record.line)
  }

  const classes: ClassCount[] = [...counts.entries()]
    .map(([label, lines]) => ({
      label,
      count: lines.length,
      proportion: lines.length / withOutputs.length,
      lines,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

  const longestLabel = Math.max(...classes.map((c) => c.label.length))

  // Label-shaped means: few distinct values, each short, each seen more than once.
  const isClassificationShaped =
    classes.length <= MAX_DISTINCT_LABELS &&
    longestLabel <= MAX_LABEL_LENGTH &&
    withOutputs.length / classes.length >= MIN_RECORDS_PER_LABEL

  if (!isClassificationShaped) {
    return {
      ...EMPTY,
      classes: [],
      distinctLabels: classes.length,
      exampleCount: records.length,
    }
  }

  const majority = classes[0]!
  const minority = classes[classes.length - 1]!

  return {
    isClassificationShaped: true,
    classes,
    distinctLabels: classes.length,
    imbalanceRatio: minority.count === 0 ? 0 : majority.count / minority.count,
    imbalanced: classes.length > 1 && majority.count / minority.count >= IMBALANCE_RATIO_THRESHOLD,
    singleClass: classes.length === 1,
    majorityLabel: majority.label,
    majorityBaselineAccuracy: majority.count / withOutputs.length,
    underrepresented: classes
      .filter((c) => c.count < MIN_EXAMPLES_PER_CLASS)
      .map((c) => c.label),
    exampleCount: withOutputs.length,
  }
}
