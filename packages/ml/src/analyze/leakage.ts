/**
 * Train/test leakage — the highest-value check in this package.
 *
 * If a held-out test example also appears in training, the model has memorised it
 * and the eval score it produces is not a measurement of anything. It is the
 * single failure that turns a Crucible passport from a verifiable claim into a
 * confidently-presented lie, and it is invisible unless something looks for it.
 *
 * Leakage is compared on the PROMPT side (`record.key`), not the whole record.
 * A test question the model was trained on is contaminated whether or not the
 * two rows happen to carry the same answer — and the differing-answer case is
 * the one a naive whole-record diff misses.
 */

import type { NormalisedRecord } from './records.js'
import { contentHash, jaccard, preview, shingle } from './duplicates.js'

/**
 * Default near-leak threshold, deliberately tuned for RECALL rather than precision.
 *
 * 0.75, not the more usual 0.8+, because character n-gram Jaccard is surprisingly
 * punctuation-sensitive on short text: measured here, adding a comma and an
 * exclamation mark to a 46-character sentence drops similarity to 0.796. At 0.85
 * that obvious leak goes unreported.
 *
 * The asymmetry justifies it. A false alarm costs the user one glance at two line
 * numbers. A missed leak silently inflates every eval number that follows, and
 * those numbers end up hashed into a passport as a public claim.
 */
export const DEFAULT_LEAK_THRESHOLD = 0.75

/**
 * Beyond this many train x test comparisons, candidates are pre-filtered by a
 * shared-shingle index instead of brute force.
 */
const BRUTE_FORCE_MAX_COMPARISONS = 400_000

export interface LeakedPair {
  trainLine: number
  testLine: number
  /** Jaccard similarity of the prompt sides. Exactly 1 for an exact leak. */
  similarity: number
  /** True when the entire record — prompt AND answer — is identical. */
  identicalRecord: boolean
  preview: string
}

export interface LeakageReport {
  exact: LeakedPair[]
  near: LeakedPair[]
  /** Test line numbers that leaked from at least one train row, ascending. */
  contaminatedTestLines: number[]
  contaminatedTestCount: number
  testExampleCount: number
  trainExampleCount: number
  /** contaminatedTestCount / testExampleCount, 0..1. */
  contaminatedFraction: number
  clean: boolean
  threshold: number
}

export interface LeakageOptions {
  /** Jaccard similarity at or above which a pair counts as a near leak. */
  threshold?: number
  shingleSize?: number
}

export function trainTestLeakage(
  train: readonly NormalisedRecord[],
  test: readonly NormalisedRecord[],
  options: LeakageOptions = {},
): LeakageReport {
  const threshold = options.threshold ?? DEFAULT_LEAK_THRESHOLD
  const shingleSize = options.shingleSize ?? 5

  const empty: LeakageReport = {
    exact: [],
    near: [],
    contaminatedTestLines: [],
    contaminatedTestCount: 0,
    testExampleCount: test.length,
    trainExampleCount: train.length,
    contaminatedFraction: 0,
    clean: true,
    threshold,
  }

  if (train.length === 0 || test.length === 0) return empty

  // ---- Exact leaks: hash the prompt side of every training row. ----------------
  const trainByKeyHash = new Map<string, NormalisedRecord[]>()
  for (const record of train) {
    const hash = contentHash(record.key)
    const bucket = trainByKeyHash.get(hash)
    if (bucket === undefined) trainByKeyHash.set(hash, [record])
    else bucket.push(record)
  }

  const exact: LeakedPair[] = []
  /** Test lines already explained by an exact leak — they must not be re-reported as near. */
  const exactTestLines = new Set<number>()

  for (const testRecord of test) {
    const matches = trainByKeyHash.get(contentHash(testRecord.key))
    if (matches === undefined) continue

    exactTestLines.add(testRecord.line)

    for (const trainRecord of matches) {
      exact.push({
        trainLine: trainRecord.line,
        testLine: testRecord.line,
        similarity: 1,
        identicalRecord: contentHash(trainRecord.full) === contentHash(testRecord.full),
        preview: preview(testRecord.key),
      })
    }
  }

  // ---- Near leaks: shingle Jaccard over candidate pairs. -----------------------
  const trainShingles = train.map((r) => shingle(r.key, shingleSize))
  const testShingles = test.map((r) => shingle(r.key, shingleSize))

  /**
   * On large train sets, an inverted index from shingle -> train rows narrows the
   * comparison set. Any pair above the threshold necessarily shares shingles, so
   * this filters candidates without changing the verdict — and every surviving
   * candidate is still verified with a real Jaccard computation.
   */
  const useIndex = train.length * test.length > BRUTE_FORCE_MAX_COMPARISONS
  let shingleIndex: Map<string, number[]> | null = null

  if (useIndex) {
    shingleIndex = new Map()
    for (let t = 0; t < train.length; t += 1) {
      for (const s of trainShingles[t]!) {
        const bucket = shingleIndex.get(s)
        if (bucket === undefined) shingleIndex.set(s, [t])
        else bucket.push(t)
      }
    }
  }

  const near: LeakedPair[] = []

  for (let i = 0; i < test.length; i += 1) {
    const testRecord = test[i]!
    if (exactTestLines.has(testRecord.line)) continue

    let candidates: Iterable<number>
    if (shingleIndex === null) {
      candidates = train.keys()
    } else {
      const hits = new Set<number>()
      for (const s of testShingles[i]!) {
        const bucket = shingleIndex.get(s)
        if (bucket !== undefined) for (const t of bucket) hits.add(t)
      }
      candidates = hits
    }

    for (const t of candidates) {
      const similarity = jaccard(trainShingles[t]!, testShingles[i]!)
      if (similarity < threshold) continue

      near.push({
        trainLine: train[t]!.line,
        testLine: testRecord.line,
        similarity,
        identicalRecord: contentHash(train[t]!.full) === contentHash(testRecord.full),
        preview: preview(testRecord.key),
      })
    }
  }

  exact.sort((a, b) => a.testLine - b.testLine || a.trainLine - b.trainLine)
  near.sort((a, b) => a.testLine - b.testLine || a.trainLine - b.trainLine)

  const contaminatedTestLines = [
    ...new Set([...exact.map((l) => l.testLine), ...near.map((l) => l.testLine)]),
  ].sort((a, b) => a - b)

  return {
    exact,
    near,
    contaminatedTestLines,
    contaminatedTestCount: contaminatedTestLines.length,
    testExampleCount: test.length,
    trainExampleCount: train.length,
    contaminatedFraction: contaminatedTestLines.length / test.length,
    clean: contaminatedTestLines.length === 0,
    threshold,
  }
}
