import { closeSync, existsSync, openSync, readSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Pre-flight dataset quality, run once at submission time.
 *
 * `src/dataset.ts` answers "what shape is this file" — format, example count, a
 * ~4-chars-per-token estimate. That is all a user is told before they pay to
 * train. `@crucible/ml`'s `analyzeDataset` answers the questions that actually
 * cost money: how much of the file is duplicated, whether the held-out split
 * leaks into training, and whether a key or a card number is about to be
 * uploaded to durable public storage. This module is the bridge.
 *
 * ## Why the library is loaded, not imported
 *
 * `services/orchestrator` is a standalone npm project with its own package.json
 * and lockfile, and must not become a workspace member — the same constraint
 * documented at the top of `src/fee.ts` and `src/networks.ts`, which duplicate
 * `@crucible/core` logic rather than depend on it. Adding
 * `"@crucible/ml": "file:../../packages/ml"` would break that: `npm ci` inside
 * this directory would then require a sibling path outside it, and `tsc` would
 * need the sibling's build output to typecheck.
 *
 * So the dependency is declared nowhere and resolved at runtime:
 *   - the report shape is mirrored locally (`MlDatasetReport`), exactly as
 *     `fee.ts` mirrors core's fee maths and `dataset.ts` mirrors its format
 *     rules — a structural port, pinned by tests that run the real library;
 *   - the implementation is found by dynamic `import()` at call time, and when
 *     it is not there the job is submitted with `severity: 'unavailable'`.
 *
 * The trade is deliberate: an orchestrator installed on its own keeps working
 * with no quality panel, and one running inside the monorepo gets the real
 * analysis. Nothing here is on the critical path of a submission.
 *
 * ## Two hard rules
 *
 * 1. NEVER fail a job. Every path returns a record; nothing here rejects or
 *    throws. `#describe` in submitter.ts is called *outside* its own try/catch,
 *    so a throw from this module would break the whole tick loop.
 * 2. NEVER echo a matched secret. `@crucible/ml` redacts at the point of
 *    detection, and even its redaction keeps a few characters — so no PII
 *    sample is copied here at all, only counts, types and line numbers. Every
 *    string that does cross is `scrub`bed first, because the job record is
 *    appended to disk by store.ts and rendered over HTTP by api.ts. A
 *    provenance tool that leaks the card number it found is worse than one that
 *    stays quiet.
 *
 * This analyses the DATASET. It says nothing about the model, the training run,
 * or what the provider actually did.
 */

// ---------------------------------------------------------------------------
// Bounds. A 100 MB dataset must not hang a submission.
//
// The analysis is synchronous CPU work (MinHash+LSH, regex scans), so it cannot
// be interrupted by a timer once started — the only honest bound is on what
// goes in. Both caps are recorded on the result so a user is never shown a
// clean report for a file that was only partly read.
// ---------------------------------------------------------------------------

/** Read at most this many bytes off the head of the training file (8 MiB). */
export const MAX_ANALYSIS_BYTES = 8 * 1024 * 1024

/** Analyse at most this many training records. */
export const MAX_ANALYSIS_RECORDS = 5_000

/** Analyse at most this many held-out records. */
export const MAX_TEST_RECORDS = 2_000

/** Cap the line lists and prose we copy onto the durable job record. */
const MAX_LINES_LISTED = 50
const MAX_MESSAGES = 20
const MAX_MESSAGE_CHARS = 400

// ---------------------------------------------------------------------------
// The shape `@crucible/ml` returns. Mirrored, not imported — see the header.
// `test/quality.test.ts` runs the real `analyzeDataset` through this type, so
// the two cannot silently drift apart.
// ---------------------------------------------------------------------------

export interface MlDatasetIssue {
  code: string
  severity: 'warn' | 'fail'
  message: string
}

export interface MlDatasetReport {
  severity: 'ok' | 'warn' | 'fail'
  exampleCount: number
  issues: MlDatasetIssue[]
  recommendations: string[]
  duplicates: {
    exact: Array<{ redundant: number }>
    near: unknown[]
    redundantCount: number
    redundantFraction: number
  }
  leakage?: {
    clean: boolean
    testExampleCount: number
    contaminatedTestCount: number
    contaminatedTestLines: number[]
  }
  pii: {
    total: number
    byType: Record<string, number>
    highSeverityCount: number
    affectedLines: number[]
  }
}

export type DatasetAnalyzer = (options: {
  train: readonly unknown[]
  test?: readonly unknown[]
}) => MlDatasetReport

// ---------------------------------------------------------------------------
// What lands on the job record.
// ---------------------------------------------------------------------------

export interface JobQualityIssue {
  code: string
  severity: 'warn' | 'fail'
  message: string
}

/**
 * Advisory dataset findings, as stored on a Job.
 *
 * `severity: 'fail'` means "do not spend money on this yet" — it does NOT stop
 * the submission. Crucible reports; the user decides.
 */
export interface JobQuality {
  /** 'unavailable' when the analysis could not run at all. */
  severity: 'ok' | 'warn' | 'fail' | 'unavailable'
  /** Epoch ms, like every other timestamp on Job. The wire renders it as ISO. */
  analyzedAt: number
  /** Why nothing was analysed. Present only when severity is 'unavailable'. */
  unavailableReason?: string
  /** Records actually read — see MAX_ANALYSIS_RECORDS. */
  recordsAnalyzed: number
  /** True when the file was larger than the caps and only a prefix was read. */
  truncated: boolean
  duplicates: {
    exactGroups: number
    redundantRecords: number
    nearPairs: number
    /** Redundant share of the records analysed, 0–1. */
    redundantFraction: number
  }
  /** Present only when a held-out split was found next to the training file. */
  leakage?: {
    clean: boolean
    testExampleCount: number
    contaminatedTestCount: number
    contaminatedTestLines: number[]
  }
  /** Counts, types and line numbers only. Never a matched value. */
  pii: {
    total: number
    highSeverity: number
    byType: Record<string, number>
    affectedLines: number[]
  }
  issues: JobQualityIssue[]
  recommendations: string[]
}

export interface QualityOptions {
  /** Held-out split. Defaults to the sibling-file convention below. */
  testPath?: string
  /** Injected for tests; production resolves `@crucible/ml` at runtime. */
  analyze?: DatasetAnalyzer
  /** Injected clock reading, so the record matches the rest of the job. */
  now?: number
}

/**
 * Everything that must not reach the durable record, masked on the way in.
 *
 * `@crucible/ml` already redacts matches at detection (see its `pii.ts`), and we
 * copy no sample at all — but two of its recommendation strings quote
 * data-derived text (the majority class label). A dataset whose "label" is a
 * card number would otherwise put those digits in `jobs.ndjson` and in an HTTP
 * response. Cheap insurance at the boundary, where the leak would become
 * permanent.
 */
export function scrub(text: string): string {
  return text
    // Long digit runs, separators and all — cards, account and national ids.
    .replace(/\d(?:[\d \-.]{10,})\d/g, '[redacted]')
    // Key-shaped tokens: OpenAI, GitHub, Slack, AWS.
    .replace(/\b(?:sk|ghp|gho|ghu|ghs|ghr|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{10,}/g, '[redacted]')
    .replace(/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, '[redacted]')
    // Hex blobs at address or private-key length.
    .replace(/\b0x[a-fA-F0-9]{32,}\b/g, '[redacted]')
    .replace(/-----BEGIN[^-]*-----/g, '[redacted]')
    // Anything email-shaped.
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[redacted]')
    .slice(0, MAX_MESSAGE_CHARS)
}

/**
 * The held-out split, by the convention this repo's own datasets already use:
 * `train.jsonl` and `test.jsonl` side by side (see `datasets/sentiment`,
 * `datasets/0g-expert`, `datasets/dolly-slice`).
 *
 * There is no way to pass an explicit test path today — `CreateJobInput` is
 * copied field-by-field in store.ts and parsed in api.ts, neither of which this
 * change touches. One `existsSync` is the entire cost of the guess.
 */
export function siblingTestPath(trainPath: string): string | undefined {
  const name = basename(trainPath)
  if (!/train/i.test(name)) return undefined
  const candidate = join(dirname(trainPath), name.replace(/train/i, 'test'))
  if (candidate === trainPath) return undefined
  return existsSync(candidate) ? candidate : undefined
}

/**
 * Read a bounded prefix of a JSONL file.
 *
 * `readFileSync` on a 100 MB dataset costs 100 MB of heap and the time to
 * decode it before we can decide to ignore most of it, so the cap is applied at
 * the read: one fixed buffer, and a partial trailing line is dropped because it
 * cannot be parsed anyway.
 */
export function readBoundedJsonl(
  path: string,
  maxBytes = MAX_ANALYSIS_BYTES,
  maxRecords = MAX_ANALYSIS_RECORDS,
): { records: unknown[]; truncated: boolean } {
  const fd = openSync(path, 'r')
  let buffer: Buffer
  let bytesRead: number
  try {
    buffer = Buffer.allocUnsafe(maxBytes)
    bytesRead = readSync(fd, buffer, 0, maxBytes, 0)
  } finally {
    closeSync(fd)
  }

  const hitByteCap = bytesRead === maxBytes
  const text = buffer.subarray(0, bytesRead).toString('utf8').replace(/^﻿/, '')
  const lines = text.split('\n')
  // At the byte cap the last line is almost certainly cut mid-record.
  if (hitByteCap) lines.pop()

  const records: unknown[] = []
  let hitRecordCap = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    if (records.length >= maxRecords) {
      hitRecordCap = true
      break
    }
    try {
      records.push(JSON.parse(trimmed))
    } catch {
      // Same tolerance as analyzeDatasetFile: an unparseable line is skipped,
      // never fatal. Structural validation is core's job, not ours.
    }
  }

  return { records, truncated: hitByteCap || hitRecordCap }
}

// ---------------------------------------------------------------------------
// Runtime resolution of @crucible/ml.
// ---------------------------------------------------------------------------

/** Resolved once per process; `null` records "looked, not there". */
let analyzerPromise: Promise<DatasetAnalyzer | null> | undefined

function candidateSpecifiers(): string[] {
  const specifiers = ['@crucible/ml']
  // Also walk up from this module looking for the monorepo's built package, so
  // a checkout works whether it is running from src/ (tsx) or dist/ (tsc).
  try {
    let dir = dirname(fileURLToPath(import.meta.url))
    for (let depth = 0; depth < 6; depth += 1) {
      specifiers.push(
        resolve(dir, 'packages/ml/dist/index.js'),
        // No `openai` import on this path — usable even when ml's own
        // dependencies were never installed.
        resolve(dir, 'packages/ml/dist/analyze/index.js'),
      )
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  } catch {
    // import.meta.url unavailable — the bare specifier is still worth a try.
  }
  return specifiers
}

async function loadAnalyzer(): Promise<DatasetAnalyzer | null> {
  for (const specifier of candidateSpecifiers()) {
    try {
      // Deliberately a variable, not a literal: a literal would make `tsc`
      // resolve the sibling package, which is exactly the coupling this
      // service is documented to avoid.
      const loaded = (await import(specifier)) as { analyzeDataset?: unknown }
      if (typeof loaded.analyzeDataset === 'function') {
        return loaded.analyzeDataset as DatasetAnalyzer
      }
    } catch {
      // Not installed at this location. Try the next.
    }
  }
  return null
}

function resolveAnalyzer(): Promise<DatasetAnalyzer | null> {
  analyzerPromise ??= loadAnalyzer()
  return analyzerPromise
}

/** Test hook: forget the resolved module so the next call looks again. */
export function resetAnalyzerCache(): void {
  analyzerPromise = undefined
}

// ---------------------------------------------------------------------------

function unavailable(reason: string, now: number): JobQuality {
  return {
    severity: 'unavailable',
    analyzedAt: now,
    unavailableReason: scrub(reason),
    recordsAnalyzed: 0,
    truncated: false,
    duplicates: { exactGroups: 0, redundantRecords: 0, nearPairs: 0, redundantFraction: 0 },
    pii: { total: 0, highSeverity: 0, byType: {}, affectedLines: [] },
    issues: [],
    recommendations: [],
  }
}

/**
 * Analyse a job's dataset. Always resolves, never rejects.
 *
 * Returns `undefined` only when there is nothing to analyse (no local file) —
 * matching `#describe`'s existing "omit the field" degradation.
 */
export async function analyzeDatasetQuality(
  trainPath: string,
  options: QualityOptions = {},
): Promise<JobQuality | undefined> {
  const now = options.now ?? Date.now()

  try {
    if (!trainPath || !existsSync(trainPath)) return undefined

    const analyze = options.analyze ?? (await resolveAnalyzer())
    if (analyze === null || analyze === undefined) {
      return unavailable('@crucible/ml is not installed alongside this orchestrator', now)
    }

    const train = readBoundedJsonl(trainPath)
    if (train.records.length === 0) return undefined

    const testPath = options.testPath ?? siblingTestPath(trainPath)
    const test =
      testPath !== undefined && existsSync(testPath)
        ? readBoundedJsonl(testPath, MAX_ANALYSIS_BYTES, MAX_TEST_RECORDS)
        : undefined

    const report = analyze({
      train: train.records,
      ...(test === undefined ? {} : { test: test.records }),
    })

    return toJobQuality(report, {
      now,
      truncated: train.truncated || (test?.truncated ?? false),
    })
  } catch (error) {
    // Advisory work must never cost a submission. The reason is recorded,
    // scrubbed, so a user can see the panel is empty on purpose.
    return unavailable(errorText(error), now)
  }
}

/** Project the library's report onto the job record, dropping every raw match. */
export function toJobQuality(
  report: MlDatasetReport,
  context: { now: number; truncated: boolean },
): JobQuality {
  const quality: JobQuality = {
    severity: report.severity,
    analyzedAt: context.now,
    recordsAnalyzed: report.exampleCount,
    truncated: context.truncated,
    duplicates: {
      exactGroups: report.duplicates.exact.length,
      redundantRecords: report.duplicates.redundantCount,
      nearPairs: report.duplicates.near.length,
      redundantFraction: report.duplicates.redundantFraction,
    },
    pii: {
      // `findings` is deliberately not copied: each one carries a `sample`,
      // and even a redacted sample keeps the first and last characters of the
      // secret. Line numbers are enough to go and look.
      total: report.pii.total,
      highSeverity: report.pii.highSeverityCount,
      byType: { ...report.pii.byType },
      affectedLines: report.pii.affectedLines.slice(0, MAX_LINES_LISTED),
    },
    issues: report.issues.slice(0, MAX_MESSAGES).map((issue) => ({
      code: issue.code,
      severity: issue.severity,
      message: scrub(issue.message),
    })),
    recommendations: report.recommendations.slice(0, MAX_MESSAGES).map(scrub),
  }

  if (report.leakage !== undefined) {
    quality.leakage = {
      clean: report.leakage.clean,
      testExampleCount: report.leakage.testExampleCount,
      contaminatedTestCount: report.leakage.contaminatedTestCount,
      contaminatedTestLines: report.leakage.contaminatedTestLines.slice(0, MAX_LINES_LISTED),
    }
  }

  if (context.truncated) {
    quality.recommendations.unshift(
      `Only the first ${report.exampleCount} record(s) were analysed — the file is larger than ` +
        `the ${MAX_ANALYSIS_RECORDS}-record / ${MAX_ANALYSIS_BYTES / (1024 * 1024)} MiB submission-time ` +
        `cap. Findings below cover that prefix only; absence of a finding is not evidence of absence.`,
    )
  }

  return quality
}

/** The three findings a user would want before paying, as one line for a log. */
export function qualityHeadline(quality: JobQuality): string {
  if (quality.severity === 'unavailable') {
    return `dataset analysis unavailable (${quality.unavailableReason ?? 'unknown'})`
  }
  const parts = [
    `${quality.duplicates.redundantRecords} duplicate record(s)`,
    quality.leakage === undefined
      ? 'no held-out split to check for leakage'
      : `${quality.leakage.contaminatedTestCount} leaked test example(s)`,
    // Counts only. The values themselves are never logged.
    `${quality.pii.total} PII/secret match(es)`,
  ]
  return `${quality.severity}: ${parts.join(', ')}`
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
