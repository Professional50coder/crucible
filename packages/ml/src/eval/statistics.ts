/**
 * Statistics for eval comparisons.
 *
 * The whole point of Crucible is a claim someone else can check. An unqualified
 * "+12% accuracy" measured on 40 held-out examples is not checkable — it is a
 * coin flip dressed as evidence. So every comparison carries a confidence
 * interval, and the interval, not the point estimate, decides whether the
 * passport is allowed to use the word "improvement".
 *
 * Everything here is seeded and deterministic: the same scores plus the same
 * seed produce byte-identical numbers on any machine, which matters because
 * these numbers get hashed into a manifest.
 */

/** Default resample count. 1000 is the conventional floor for a percentile interval. */
export const DEFAULT_ITERATIONS = 1000

/** Default seed, so an unconfigured run is still reproducible. */
export const DEFAULT_SEED = 20260814

/**
 * Below this many examples we refuse to call anything significant, whatever the
 * interval says. A bootstrap resamples the sample you have; with a handful of
 * examples it faithfully reproduces the accident of which examples you picked.
 */
export const MINIMUM_SAMPLE_FOR_SIGNIFICANCE = 5

/**
 * mulberry32 — a small, fast, well-distributed 32-bit PRNG.
 * Chosen over `Math.random` because reproducibility is a requirement, and over a
 * dependency because a 6-line generator does not need one.
 */
export function createRng(seed: number): () => number {
  let state = seed >>> 0
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  let total = 0
  for (const value of values) total += value
  return total / values.length
}

/** Linear-interpolation percentile (type 7, the R/NumPy default) over a SORTED array. */
export function percentile(sortedValues: readonly number[], p: number): number {
  if (sortedValues.length === 0) return 0
  if (sortedValues.length === 1) return sortedValues[0]!

  const rank = ((sortedValues.length - 1) * p) / 100
  const lowerIndex = Math.floor(rank)
  const upperIndex = Math.ceil(rank)

  if (lowerIndex === upperIndex) return sortedValues[lowerIndex]!

  const weight = rank - lowerIndex
  return sortedValues[lowerIndex]! * (1 - weight) + sortedValues[upperIndex]! * weight
}

export interface BootstrapOptions {
  /** Resample count. More iterations = a smoother interval, not a narrower one. */
  iterations?: number
  /** PRNG seed. Same seed + same scores = same interval, always. */
  seed?: number
  /** Two-sided confidence level, 0..1. Default 0.95. */
  confidenceLevel?: number
  /** Sample size below which `significant` is forced false. */
  minimumSampleSize?: number
}

export interface BootstrapResult {
  /** mean(tuned) - mean(base) on the actual data, no resampling involved. */
  observedDelta: number
  /** Lower bound of the confidence interval on the delta. */
  lower: number
  /** Upper bound of the confidence interval on the delta. */
  upper: number
  /** True only when the whole interval sits on one side of zero. */
  significant: boolean
  /** True when the sample was too small to support a significance claim at all. */
  underpowered: boolean
  confidenceLevel: number
  iterations: number
  seed: number
  exampleCount: number
  method: 'paired-percentile-bootstrap'
}

/**
 * Paired percentile bootstrap on the delta between two runs.
 *
 * Paired matters: both models are scored on the SAME test examples, so each
 * resample draws example indices once and reads both runs at that index. That
 * removes example difficulty from the variance and is strictly more sensitive
 * than resampling the two runs independently — the honest version of the test is
 * also the one more likely to detect a real improvement.
 *
 * Percentile (rather than BCa) is chosen for auditability: it is fifteen lines,
 * has no bias-correction constants to get subtly wrong, and anyone can re-derive
 * the interval from the published seed and scores.
 */
export function bootstrapDeltaCI(
  baseScores: readonly number[],
  tunedScores: readonly number[],
  options: BootstrapOptions = {},
): BootstrapResult {
  if (baseScores.length !== tunedScores.length) {
    throw new Error(
      `bootstrapDeltaCI: runs must be the same length ` +
        `(base has ${baseScores.length}, tuned has ${tunedScores.length}). ` +
        `Scores are paired by test-example index.`,
    )
  }

  const iterations = options.iterations ?? DEFAULT_ITERATIONS
  const seed = options.seed ?? DEFAULT_SEED
  const confidenceLevel = options.confidenceLevel ?? 0.95
  const minimumSampleSize = options.minimumSampleSize ?? MINIMUM_SAMPLE_FOR_SIGNIFICANCE

  const n = baseScores.length
  const base: BootstrapResult = {
    observedDelta: 0,
    lower: 0,
    upper: 0,
    significant: false,
    underpowered: true,
    confidenceLevel,
    iterations,
    seed,
    exampleCount: n,
    method: 'paired-percentile-bootstrap',
  }

  if (n === 0) return base

  const observedDelta = mean(tunedScores) - mean(baseScores)

  const rng = createRng(seed)
  const deltas = new Array<number>(iterations)

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let baseTotal = 0
    let tunedTotal = 0
    for (let draw = 0; draw < n; draw += 1) {
      const index = Math.floor(rng() * n)
      baseTotal += baseScores[index]!
      tunedTotal += tunedScores[index]!
    }
    deltas[iteration] = (tunedTotal - baseTotal) / n
  }

  deltas.sort((a, b) => a - b)

  const tail = ((1 - confidenceLevel) / 2) * 100
  const lower = percentile(deltas, tail)
  const upper = percentile(deltas, 100 - tail)

  const underpowered = n < minimumSampleSize
  const intervalExcludesZero = lower > 0 || upper < 0

  return {
    ...base,
    observedDelta,
    lower,
    upper,
    underpowered,
    significant: !underpowered && intervalExcludesZero,
  }
}
