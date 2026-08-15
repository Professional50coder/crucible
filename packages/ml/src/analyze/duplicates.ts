/**
 * Duplicate detection — exact and near.
 *
 * Near-duplicate detection here is classical: character n-gram shingling with
 * Jaccard similarity, accelerated by seeded MinHash + LSH banding on large
 * datasets. No embeddings, no model download, no network. That is a constraint,
 * but it is also the right tool: the duplicates that actually appear in a
 * fine-tuning set are copy-paste variants, and shingling catches those exactly
 * while an embedding model would blur them into "semantically related".
 *
 * Everything is seeded, so two runs over the same file produce the same report.
 */

import { createRng } from '../eval/statistics.js'
import type { NormalisedRecord } from './records.js'

/** Default shingle width. 5 characters is the standard choice for near-dup text. */
export const DEFAULT_SHINGLE_SIZE = 5

/** Above this many records, switch from all-pairs to MinHash + LSH. */
export const DEFAULT_EXACT_PAIRS_MAX_N = 800

const DEFAULT_PERMUTATIONS = 128
const DEFAULT_BANDS = 32
const DEFAULT_SEED = 20260814
const PREVIEW_LENGTH = 120

const normalise = (text: string): string => text.trim().toLowerCase().replace(/\s+/g, ' ')

export function preview(text: string, length = PREVIEW_LENGTH): string {
  const flat = normalise(text)
  return flat.length <= length ? flat : `${flat.slice(0, length - 1)}…`
}

/** Character n-grams of `text`, normalised first so spacing and case are irrelevant. */
export function shingle(text: string, size = DEFAULT_SHINGLE_SIZE): Set<string> {
  const flat = normalise(text)
  if (flat.length === 0) return new Set()
  if (flat.length <= size) return new Set([flat])

  const shingles = new Set<string>()
  for (let i = 0; i + size <= flat.length; i += 1) {
    shingles.add(flat.slice(i, i + size))
  }
  return shingles
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  if (a.size === 0 || b.size === 0) return 0

  const [small, large] = a.size <= b.size ? [a, b] : [b, a]

  let intersection = 0
  for (const item of small) if (large.has(item)) intersection += 1

  return intersection / (a.size + b.size - intersection)
}

/** FNV-1a, 32-bit. Small, fast, no dependency, and stable across platforms. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/** A stable content hash for exact-duplicate grouping. */
export function contentHash(text: string): string {
  const flat = normalise(text)
  // Two independent 32-bit hashes over different salts: 64 bits of key space,
  // which is ample for datasets of a few thousand records and keeps this
  // dependency-free.
  return `${fnv1a(flat).toString(16)}-${fnv1a(`${flat}`).toString(16)}`
}

export interface MinhashOptions {
  seed?: number
  permutations?: number
}

/**
 * MinHash signature via seeded (a*h + b) mod prime permutations of the shingle hashes.
 * Deterministic for a given seed, which is a hard requirement here.
 */
export function minhashSignature(
  shingles: ReadonlySet<string>,
  options: MinhashOptions = {},
): number[] {
  const permutations = options.permutations ?? DEFAULT_PERMUTATIONS
  const seed = options.seed ?? DEFAULT_SEED

  const rng = createRng(seed)
  const coefficients = Array.from({ length: permutations }, () => ({
    a: Math.floor(rng() * 0x7fffffff) | 1, // odd, so it is invertible mod 2^32
    b: Math.floor(rng() * 0x7fffffff),
  }))

  const signature = new Array<number>(permutations).fill(Number.MAX_SAFE_INTEGER)
  if (shingles.size === 0) return signature

  const hashes: number[] = []
  for (const s of shingles) hashes.push(fnv1a(s))

  for (let p = 0; p < permutations; p += 1) {
    const { a, b } = coefficients[p]!
    let min = Number.MAX_SAFE_INTEGER
    for (const h of hashes) {
      const permuted = (Math.imul(h, a) + b) >>> 0
      if (permuted < min) min = permuted
    }
    signature[p] = min
  }

  return signature
}

export interface DuplicateGroup {
  hash: string
  /** 1-based JSONL line numbers, ascending. */
  lines: number[]
  /** How many records are in this group. */
  count: number
  /** How many are redundant, i.e. count - 1. This is what the user should delete. */
  redundant: number
  preview: string
}

/**
 * Exact duplicates, after whitespace/case normalisation.
 *
 * Compared on the FULL record: two rows with the same question but different
 * answers are contradictory training signal, not duplicates, and conflating the
 * two would hide a genuinely different problem.
 */
export function exactDuplicates(records: readonly NormalisedRecord[]): DuplicateGroup[] {
  const byHash = new Map<string, NormalisedRecord[]>()

  for (const record of records) {
    const hash = contentHash(record.full)
    const bucket = byHash.get(hash)
    if (bucket === undefined) byHash.set(hash, [record])
    else bucket.push(record)
  }

  const groups: DuplicateGroup[] = []

  for (const [hash, bucket] of byHash) {
    if (bucket.length < 2) continue
    groups.push({
      hash,
      lines: bucket.map((r) => r.line).sort((a, b) => a - b),
      count: bucket.length,
      redundant: bucket.length - 1,
      preview: preview(bucket[0]!.full),
    })
  }

  return groups.sort((a, b) => a.lines[0]! - b.lines[0]!)
}

export interface NearDuplicatePair {
  lineA: number
  lineB: number
  /** True Jaccard similarity of the two shingle sets, 0..1 — never the MinHash estimate. */
  similarity: number
  previewA: string
  previewB: string
}

export interface NearDuplicateOptions {
  /** Report pairs at or above this Jaccard similarity. */
  threshold: number
  shingleSize?: number
  seed?: number
  permutations?: number
  bands?: number
  /** Record count at or below which all pairs are compared exactly. */
  exactPairsMaxN?: number
}

/** Group indices that share a band signature — the LSH candidate-generation step. */
function lshCandidates(
  signatures: number[][],
  bands: number,
  permutations: number,
): Set<string> {
  const rowsPerBand = Math.max(1, Math.floor(permutations / bands))
  const candidates = new Set<string>()

  for (let band = 0; band < bands; band += 1) {
    const start = band * rowsPerBand
    if (start >= permutations) break
    const end = Math.min(start + rowsPerBand, permutations)

    const buckets = new Map<string, number[]>()
    for (let i = 0; i < signatures.length; i += 1) {
      const key = signatures[i]!.slice(start, end).join(',')
      const bucket = buckets.get(key)
      if (bucket === undefined) buckets.set(key, [i])
      else bucket.push(i)
    }

    for (const bucket of buckets.values()) {
      if (bucket.length < 2) continue
      for (let x = 0; x < bucket.length; x += 1) {
        for (let y = x + 1; y < bucket.length; y += 1) {
          candidates.add(`${bucket[x]}:${bucket[y]}`)
        }
      }
    }
  }

  return candidates
}

/**
 * Near-duplicate pairs above `threshold`.
 *
 * Small datasets take the exact all-pairs path, which is complete by construction.
 * Large ones take MinHash + LSH to generate candidates and then verify each
 * candidate with a real Jaccard computation — so a reported similarity is always
 * exact, and LSH only ever affects which pairs get looked at.
 */
export function nearDuplicates(
  records: readonly NormalisedRecord[],
  options: NearDuplicateOptions,
): NearDuplicatePair[] {
  const {
    threshold,
    shingleSize = DEFAULT_SHINGLE_SIZE,
    seed = DEFAULT_SEED,
    permutations = DEFAULT_PERMUTATIONS,
    bands = DEFAULT_BANDS,
    exactPairsMaxN = DEFAULT_EXACT_PAIRS_MAX_N,
  } = options

  if (records.length < 2) return []

  const shingleSets = records.map((r) => shingle(r.full, shingleSize))
  const pairs: NearDuplicatePair[] = []

  const record = (i: number, j: number): void => {
    const similarity = jaccard(shingleSets[i]!, shingleSets[j]!)
    if (similarity < threshold) return
    pairs.push({
      lineA: records[i]!.line,
      lineB: records[j]!.line,
      similarity,
      previewA: preview(records[i]!.full),
      previewB: preview(records[j]!.full),
    })
  }

  if (records.length <= exactPairsMaxN) {
    for (let i = 0; i < records.length; i += 1) {
      for (let j = i + 1; j < records.length; j += 1) record(i, j)
    }
  } else {
    const signatures = shingleSets.map((s) => minhashSignature(s, { seed, permutations }))
    const candidates = lshCandidates(signatures, bands, permutations)

    const ordered = [...candidates]
      .map((key) => key.split(':').map(Number) as [number, number])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])

    for (const [i, j] of ordered) record(i, j)
  }

  return pairs.sort((a, b) => a.lineA - b.lineA || a.lineB - b.lineB)
}
