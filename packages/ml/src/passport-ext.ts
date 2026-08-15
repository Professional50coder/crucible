/**
 * Passport extension — `evaluation` and `quality` sections.
 *
 * These are intended to be merged into `PassportManifest` (docs/INTERFACES.md §1)
 * as optional fields. This package deliberately does NOT import packages/core:
 * core owns the manifest shape and another agent owns core. Everything here is
 * typed structurally, so adding `evaluation?: EvalSection` and `quality?:
 * QualitySection` to core's interface is all the integration required.
 *
 * Three constraints shaped these types:
 *
 *   1. The manifest is canonicalised (keys sorted, no whitespace) and keccak-hashed,
 *      and that hash is the on-chain anchor. So: no `undefined` values, and every
 *      float rounded at the boundary rather than carrying 17 significant digits
 *      into a hash.
 *   2. The manifest is PUBLIC. No PII sample, no secret fragment, no raw dataset
 *      text may appear here — only counts and verdicts.
 *   3. Bulk detail stays out. The per-example eval table is summarised by a digest,
 *      so the full table can be published alongside and verified against the
 *      passport without bloating the manifest that gets hashed.
 */

import { createHash } from 'node:crypto'

import type { DatasetReport, Severity } from './analyze/report.js'
import type { EvalComparison } from './eval/compare.js'
import { evalSummary } from './eval/compare.js'

/** Decimal places kept for every float. Enough to be meaningful, few enough to hash stably. */
export const NUMERIC_PRECISION = 6

const round = (value: number): number => {
  const factor = 10 ** NUMERIC_PRECISION
  return Math.round(value * factor) / factor
}

export interface EvalSection {
  /** Scorer used, e.g. "exactMatch". */
  metric: string
  baseModel: string
  tunedModel: string
  /** 0..1 */
  baseScore: number
  /** 0..1 */
  tunedScore: number
  absoluteDelta: number
  relativeImprovement: number
  /** True when baseScore was 0, making relativeImprovement undefined rather than large. */
  baselineZero: boolean
  /** Examples scored in both runs. */
  exampleCount: number
  /** Examples dropped because a request failed in one of the runs. */
  excludedForFailure: number
  wins: number
  losses: number
  ties: number
  confidenceInterval: { lower: number; upper: number }
  confidenceLevel: number
  /** The only field that licenses the word "improvement" anywhere in the UI. */
  significant: boolean
  underpowered: boolean
  method: string
  bootstrapIterations: number
  bootstrapSeed: number
  /** sha256 over the canonical per-example table; publish the table separately. */
  perExampleDigest: string
  /** One-line human sentence. Never claims improvement when `significant` is false. */
  summary: string
}

export interface QualitySection {
  severity: Severity
  exampleCount: number
  format: string | null
  exactDuplicateCount: number
  nearDuplicatePairCount: number
  /** Whether a held-out split was supplied and checked at all. */
  leakageChecked: boolean
  /** Test examples that also appear in training. Zero when unchecked. */
  leakedTestExamples: number
  /** True only when leakage was checked AND nothing leaked. */
  testSetClean: boolean
  piiFindingCount: number
  piiHighSeverityCount: number
  medianTokens: number
  totalEstimatedTokens: number
  classBalanced: boolean
  /** Accuracy from always guessing the majority label; 0 for non-label data. */
  majorityBaselineAccuracy: number
  /** Machine-readable codes only — never the free-text recommendations. */
  issueCodes: string[]
}

/** Stable sha256 over a canonical (recursively key-sorted) JSON encoding. */
function digest(value: unknown): string {
  const canonical = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonical)
    if (input !== null && typeof input === 'object') {
      const entries = Object.entries(input as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      return Object.fromEntries(entries.map(([k, v]) => [k, canonical(v)]))
    }
    return input
  }

  return `0x${createHash('sha256').update(JSON.stringify(canonical(value)), 'utf8').digest('hex')}`
}

export function buildEvalSection(comparison: EvalComparison): EvalSection {
  return {
    metric: comparison.metric,
    baseModel: comparison.baseModel,
    tunedModel: comparison.tunedModel,
    baseScore: round(comparison.baseScore),
    tunedScore: round(comparison.tunedScore),
    absoluteDelta: round(comparison.absoluteDelta),
    relativeImprovement: round(comparison.relativeImprovement),
    baselineZero: comparison.baselineZero,
    exampleCount: comparison.exampleCount,
    excludedForFailure: comparison.excludedForFailure,
    wins: comparison.wins,
    losses: comparison.losses,
    ties: comparison.ties,
    confidenceInterval: {
      lower: round(comparison.confidenceInterval.lower),
      upper: round(comparison.confidenceInterval.upper),
    },
    confidenceLevel: comparison.confidenceLevel,
    significant: comparison.significant,
    underpowered: comparison.underpowered,
    method: comparison.bootstrap.method,
    bootstrapIterations: comparison.bootstrap.iterations,
    bootstrapSeed: comparison.bootstrap.seed,
    perExampleDigest: digest(comparison.perExample),
    summary: evalSummary(comparison),
  }
}

export function buildQualitySection(report: DatasetReport): QualitySection {
  const leakageChecked = report.leakage !== undefined

  return {
    severity: report.severity,
    exampleCount: report.exampleCount,
    format: report.format,
    exactDuplicateCount: report.duplicates.redundantCount,
    nearDuplicatePairCount: report.duplicates.near.length,
    leakageChecked,
    leakedTestExamples: report.leakage?.contaminatedTestCount ?? 0,
    testSetClean: leakageChecked && report.leakage!.clean,
    piiFindingCount: report.pii.total,
    piiHighSeverityCount: report.pii.highSeverityCount,
    medianTokens: round(report.length.median),
    totalEstimatedTokens: report.length.totalTokens,
    classBalanced: report.classBalance.isClassificationShaped
      ? !report.classBalance.imbalanced
      : true,
    majorityBaselineAccuracy: report.classBalance.isClassificationShaped
      ? round(report.classBalance.majorityBaselineAccuracy)
      : 0,
    issueCodes: report.issues.map((issue) => issue.code),
  }
}

/**
 * Attach an evaluation to a manifest, returning a NEW object.
 *
 * Generic over the manifest type so it composes with core's `PassportManifest`
 * without importing it.
 */
export function attachEvaluation<T extends object>(
  manifest: T,
  comparison: EvalComparison,
): T & { evaluation: EvalSection } {
  return { ...manifest, evaluation: buildEvalSection(comparison) }
}

/** Attach a dataset-quality summary to a manifest, returning a NEW object. */
export function attachQuality<T extends object>(
  manifest: T,
  report: DatasetReport,
): T & { quality: QualitySection } {
  return { ...manifest, quality: buildQualitySection(report) }
}
