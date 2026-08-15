/**
 * Scorers — pure functions from (modelOutput, expectedOutput) to a 0..1 score.
 *
 * Every scorer here is deterministic, dependency-free and independently tested.
 * They are deliberately boring: a passport that publishes an improvement number
 * has to be able to defend how that number was computed, and "we normalised
 * whitespace and compared strings" is defensible in a way that a learned metric
 * is not.
 */

/** Trim, lowercase, collapse all internal whitespace runs to a single space. */
export function normaliseText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Lowercased alphanumeric tokens. Punctuation is a separator, not a token. */
export function tokenise(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z0-9]+/g)
  return matches === null ? [] : matches
}

/** A per-example scorer. Both arguments are raw text; normalisation is the scorer's job. */
export type Scorer = (output: string, expected: string) => number

export function exactMatch(output: string, expected: string): number {
  return normaliseText(output) === normaliseText(expected) ? 1 : 0
}

/**
 * 1 when the normalised expected answer occurs anywhere in the normalised output.
 * An empty expected string scores 0 — every string contains "", and a metric that
 * silently returns 1 for missing ground truth is how fake eval numbers get made.
 */
export function containsMatch(output: string, expected: string): number {
  const needle = normaliseText(expected)
  if (needle === '') return 0
  return normaliseText(output).includes(needle) ? 1 : 0
}

/** Multiset (bag-of-tokens) overlap F1. Order-insensitive, repetition-penalising. */
export function tokenF1(output: string, expected: string): number {
  const outputTokens = tokenise(output)
  const expectedTokens = tokenise(expected)

  if (outputTokens.length === 0 && expectedTokens.length === 0) return 1
  if (outputTokens.length === 0 || expectedTokens.length === 0) return 0

  const expectedCounts = new Map<string, number>()
  for (const token of expectedTokens) {
    expectedCounts.set(token, (expectedCounts.get(token) ?? 0) + 1)
  }

  let overlap = 0
  for (const token of outputTokens) {
    const remaining = expectedCounts.get(token) ?? 0
    if (remaining > 0) {
      overlap += 1
      expectedCounts.set(token, remaining - 1)
    }
  }

  if (overlap === 0) return 0

  const precision = overlap / outputTokens.length
  const recall = overlap / expectedTokens.length
  return (2 * precision * recall) / (precision + recall)
}

/** Classic Levenshtein edit distance, two-row dynamic programme. */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  let previous = new Array<number>(b.length + 1)
  let current = new Array<number>(b.length + 1)

  for (let j = 0; j <= b.length; j += 1) previous[j] = j

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(
        previous[j]! + 1, // deletion
        current[j - 1]! + 1, // insertion
        previous[j - 1]! + substitutionCost, // substitution
      )
    }
    const swap = previous
    previous = current
    current = swap
  }

  return previous[b.length]!
}

/** 1 - (editDistance / lengthOfLongerString), on normalised text. Always 0..1. */
export function levenshteinSimilarity(output: string, expected: string): number {
  const a = normaliseText(output)
  const b = normaliseText(expected)

  const longest = Math.max(a.length, b.length)
  if (longest === 0) return 1

  return 1 - levenshteinDistance(a, b) / longest
}

export interface ClassMetrics {
  label: string
  /** How many examples truly carry this label. */
  support: number
  /** How many times the model predicted this label. */
  predicted: number
  /** Correct predictions of this label. */
  correct: number
  precision: number
  recall: number
  f1: number
}

export interface ClassificationResult {
  accuracy: number
  /** Union of expected and predicted labels, sorted, so the matrix is stable. */
  labels: string[]
  perClass: ClassMetrics[]
  /** confusion[expectedIndex][predictedIndex] — row = truth, column = prediction. */
  confusion: number[][]
  /** Predictions that are not a member of the expected label set (usually chatter). */
  unknownPredictions: number
  exampleCount: number
}

/**
 * Accuracy for label tasks, with a per-class breakdown and a confusion matrix.
 *
 * Free-form model output ("I think it is positive because…") is NOT coerced onto
 * the nearest label. It becomes its own class and is counted in `unknownPredictions`,
 * because a model that cannot emit a bare label has genuinely not learned the task
 * and hiding that behind fuzzy matching flatters the fine-tune.
 */
export function classificationAccuracy(
  pairs: ReadonlyArray<{ output: string; expected: string }>,
): ClassificationResult {
  if (pairs.length === 0) {
    return {
      accuracy: 0,
      labels: [],
      perClass: [],
      confusion: [],
      unknownPredictions: 0,
      exampleCount: 0,
    }
  }

  const normalised = pairs.map((p) => ({
    output: normaliseText(p.output),
    expected: normaliseText(p.expected),
  }))

  const expectedLabels = new Set(normalised.map((p) => p.expected))
  const labels = [...new Set([...expectedLabels, ...normalised.map((p) => p.output)])].sort()
  const indexOf = new Map(labels.map((label, index) => [label, index]))

  const confusion = labels.map(() => new Array<number>(labels.length).fill(0))

  let correct = 0
  let unknownPredictions = 0

  for (const { output, expected } of normalised) {
    const row = indexOf.get(expected)!
    const column = indexOf.get(output)!
    confusion[row]![column] = confusion[row]![column]! + 1
    if (output === expected) correct += 1
    if (!expectedLabels.has(output)) unknownPredictions += 1
  }

  const perClass: ClassMetrics[] = labels.map((label, index) => {
    const support = confusion[index]!.reduce((sum, n) => sum + n, 0)
    const predicted = confusion.reduce((sum, row) => sum + row[index]!, 0)
    const correctForLabel = confusion[index]![index]!

    const precision = predicted === 0 ? 0 : correctForLabel / predicted
    const recall = support === 0 ? 0 : correctForLabel / support
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)

    return { label, support, predicted, correct: correctForLabel, precision, recall, f1 }
  })

  return {
    accuracy: correct / pairs.length,
    labels,
    perClass,
    confusion,
    unknownPredictions,
    exampleCount: pairs.length,
  }
}

/** Every per-example scorer, addressable by name so eval config can be data. */
export const SCORERS = {
  exactMatch,
  containsMatch,
  tokenF1,
  levenshteinSimilarity,
} as const satisfies Record<string, Scorer>

export type ScorerName = keyof typeof SCORERS

export function getScorer(name: ScorerName): Scorer {
  return SCORERS[name]
}
