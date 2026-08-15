/**
 * analyzeDataset — the pre-flight check, run before any money is spent.
 *
 * A fine-tune on 0G costs real tokens and takes a provider slot that the whole
 * network shares. Most of the ways a run is wasted are visible in the dataset
 * beforehand: too few examples, mixed formats, half the file duplicated, a test
 * split that overlaps training, an API key pasted into an answer.
 *
 * Severity is deliberately blunt:
 *   fail — do not spend money on this yet. 0G will reject it, or the results will
 *          be meaningless, or something is in here that must not be uploaded.
 *   warn — it will train, but you should know this before you read the numbers.
 *   ok   — nothing found.
 */

import { classBalance } from './balance.js'
import type { ClassBalance } from './balance.js'
import { exactDuplicates, nearDuplicates } from './duplicates.js'
import type { DuplicateGroup, NearDuplicatePair } from './duplicates.js'
import { trainTestLeakage } from './leakage.js'
import type { LeakageReport } from './leakage.js'
import { lengthDistribution } from './length.js'
import type { LengthDistribution } from './length.js'
import { detectPII, summarisePII } from './pii.js'
import type { PIIFinding } from './pii.js'
import { normaliseRecords } from './records.js'
import type { DatasetFormat, NormalisedRecord } from './records.js'

/** 0G's stated minimum. Mirrors MINIMUM_EXAMPLES in packages/core/src/dataset.ts. */
export const MINIMUM_EXAMPLES = 10

/** 0G's guidance for real behaviour change on Qwen2.5-0.5B. */
export const RECOMMENDED_MINIMUM_EXAMPLES = 200

/** Fraction of the dataset that must be redundant before duplicates become a failure. */
const DUPLICATE_FAIL_FRACTION = 0.2

/** Default near-duplicate threshold. Higher than the leakage default: within a single
 *  file, similar-but-distinct examples are normal and often deliberate. */
export const DEFAULT_NEAR_DUPLICATE_THRESHOLD = 0.85

export type Severity = 'ok' | 'warn' | 'fail'

export interface DatasetIssue {
  code: string
  severity: 'warn' | 'fail'
  message: string
}

export interface DatasetReport {
  severity: Severity
  exampleCount: number
  /** The dominant format, or null when the file is empty or unrecognisable. */
  format: DatasetFormat | null
  issues: DatasetIssue[]
  /** Plain sentences telling the user what to actually do. */
  recommendations: string[]
  duplicates: {
    exact: DuplicateGroup[]
    near: NearDuplicatePair[]
    redundantCount: number
    redundantFraction: number
  }
  leakage?: LeakageReport
  length: LengthDistribution
  classBalance: ClassBalance
  pii: {
    findings: PIIFinding[]
    total: number
    byType: Record<string, number>
    highSeverityCount: number
    affectedLines: number[]
  }
}

export interface AnalyzeOptions {
  /** Parsed JSONL records for the training split. */
  train: readonly unknown[]
  /** Parsed JSONL records for the held-out split, if there is one. */
  test?: readonly unknown[]
  nearDuplicateThreshold?: number
  leakageThreshold?: number
}

/** Majority format across the file, plus the count of records matching no format. */
function summariseFormats(records: readonly NormalisedRecord[]): {
  dominant: DatasetFormat | null
  counts: Map<DatasetFormat, number>
  unrecognised: number[]
} {
  const counts = new Map<DatasetFormat, number>()
  const unrecognised: number[] = []

  for (const record of records) {
    if (record.format === null) {
      unrecognised.push(record.line)
      continue
    }
    counts.set(record.format, (counts.get(record.format) ?? 0) + 1)
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])

  return { dominant: ranked[0]?.[0] ?? null, counts, unrecognised }
}

export function analyzeDataset(options: AnalyzeOptions): DatasetReport {
  const nearThreshold = options.nearDuplicateThreshold ?? DEFAULT_NEAR_DUPLICATE_THRESHOLD

  const train = normaliseRecords(options.train)
  const test = options.test === undefined ? null : normaliseRecords(options.test)

  const issues: DatasetIssue[] = []
  const recommendations: string[] = []

  const add = (code: string, severity: 'warn' | 'fail', message: string): void => {
    issues.push({ code, severity, message })
  }

  // ---- Structure: will 0G even accept this file? ------------------------------
  const formats = summariseFormats(train)

  if (train.length === 0) {
    add('empty-dataset', 'fail', 'The dataset is empty.')
    recommendations.push('The dataset is empty — there is nothing to train on.')
  } else if (train.length < MINIMUM_EXAMPLES) {
    add(
      'below-minimum',
      'fail',
      `Dataset has ${train.length} examples; 0G requires at least ${MINIMUM_EXAMPLES}.`,
    )
    recommendations.push(
      `Your dataset has ${train.length} examples. 0G rejects anything under ` +
        `${MINIMUM_EXAMPLES}, so add at least ${MINIMUM_EXAMPLES - train.length} more before uploading.`,
    )
  } else if (train.length < RECOMMENDED_MINIMUM_EXAMPLES) {
    add(
      'small-dataset',
      'warn',
      `Dataset has ${train.length} examples; 0G suggests ${RECOMMENDED_MINIMUM_EXAMPLES}–1,000 ` +
        `for Qwen2.5-0.5B to change behaviour measurably.`,
    )
    recommendations.push(
      `${train.length} examples is above 0G's ${MINIMUM_EXAMPLES}-example minimum but well below ` +
        `the ${RECOMMENDED_MINIMUM_EXAMPLES}–1,000 they suggest for Qwen2.5-0.5B — expect a small, ` +
        `possibly unmeasurable behaviour change.`,
    )
  }

  if (formats.unrecognised.length > 0) {
    const shown = formats.unrecognised.slice(0, 5).join(', ')
    add(
      'unrecognised-records',
      'fail',
      `${formats.unrecognised.length} record(s) match none of 0G's three formats (lines ${shown}).`,
    )
    recommendations.push(
      `${formats.unrecognised.length} record(s) match none of 0G's three formats ` +
        `(chat, instruction, text) — first at line ${formats.unrecognised[0]}. 0G will reject the upload.`,
    )
  }

  if (formats.counts.size > 1) {
    const summary = [...formats.counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([format, n]) => `${format} (${n})`)
      .join(', ')

    add('mixed-formats', 'fail', `Dataset mixes formats: ${summary}.`)
    recommendations.push(
      `Your file mixes dataset formats — ${summary}. 0G requires one format throughout; ` +
        `convert the minority records to "${formats.dominant}".`,
    )
  }

  // ---- Duplicates -------------------------------------------------------------
  const exact = exactDuplicates(train)
  const near = nearDuplicates(train, { threshold: nearThreshold })
  const redundantCount = exact.reduce((sum, group) => sum + group.redundant, 0)
  const redundantFraction = train.length === 0 ? 0 : redundantCount / train.length

  if (redundantCount > 0) {
    const severity: 'warn' | 'fail' =
      redundantFraction >= DUPLICATE_FAIL_FRACTION ? 'fail' : 'warn'

    add(
      'exact-duplicates',
      severity,
      `${redundantCount} redundant duplicate record(s) across ${exact.length} group(s).`,
    )
    recommendations.push(
      `${redundantCount} of your ${train.length} examples are exact duplicates ` +
        `(${(redundantFraction * 100).toFixed(0)}% of the file) across ${exact.length} group(s) — ` +
        `first at lines ${exact[0]!.lines.slice(0, 3).join(', ')}. Duplicates are paid for twice and ` +
        `over-weight whatever they teach.`,
    )
  }

  if (near.length > 0) {
    add('near-duplicates', 'warn', `${near.length} near-duplicate pair(s) above ${nearThreshold}.`)
    recommendations.push(
      `${near.length} pair(s) of examples are near-identical (Jaccard >= ${nearThreshold}), ` +
        `starting with lines ${near[0]!.lineA} and ${near[0]!.lineB}. Consider keeping one of each.`,
    )
  }

  // ---- Leakage: the check that decides whether eval numbers mean anything -----
  let leakage: LeakageReport | undefined

  if (test !== null) {
    leakage = trainTestLeakage(train, test, {
      ...(options.leakageThreshold === undefined
        ? {}
        : { threshold: options.leakageThreshold }),
    })

    if (!leakage.clean) {
      add(
        'train-test-leakage',
        'fail',
        `${leakage.contaminatedTestCount} of ${leakage.testExampleCount} test examples also ` +
          `appear in training.`,
      )

      const lines = leakage.contaminatedTestLines.slice(0, 6).join(', ')
      recommendations.push(
        `Your ${leakage.testExampleCount}-example test set shares ${leakage.contaminatedTestCount} ` +
          `examples with train (test lines ${lines}${leakage.contaminatedTestLines.length > 6 ? ', …' : ''}) — ` +
          `remove them before trusting any eval result, because the model has already seen them and ` +
          `any score they produce is memorisation, not performance.`,
      )
    }
  }

  // ---- Lengths ----------------------------------------------------------------
  const length = lengthDistribution(train)

  if (length.outlierCount > 0) {
    add(
      'length-outliers',
      'warn',
      `${length.outlierCount} record(s) are length outliers (median ${length.median} ` +
        `estimated tokens, max ${length.max}).`,
    )
    recommendations.push(
      `${length.outlierCount} record(s) sit far outside the typical length (median ` +
        `${length.median} estimated tokens, longest ${length.max} at line ` +
        `${length.outliers[0]?.line}) — check them for truncation or accidental pasting.`,
    )
  }

  // ---- Class balance ----------------------------------------------------------
  const balance = classBalance(train)

  if (balance.isClassificationShaped) {
    if (balance.singleClass) {
      add('single-class', 'fail', 'Every example carries the same label.')
      recommendations.push(
        `Every example has the label "${balance.majorityLabel}" — there is nothing here for the ` +
          `model to discriminate between.`,
      )
    } else if (balance.imbalanced) {
      add(
        'class-imbalance',
        'warn',
        `Class imbalance ${balance.imbalanceRatio.toFixed(1)}:1 ` +
          `(majority "${balance.majorityLabel}").`,
      )
      recommendations.push(
        `Your labels are imbalanced ${balance.imbalanceRatio.toFixed(1)}:1 in favour of ` +
          `"${balance.majorityLabel}". A model that always guesses "${balance.majorityLabel}" already ` +
          `scores ${(balance.majorityBaselineAccuracy * 100).toFixed(0)}% — that majority baseline, ` +
          `not zero, is the bar your fine-tune has to clear.`,
      )
    }

    if (balance.underrepresented.length > 0 && !balance.singleClass) {
      add(
        'underrepresented-classes',
        'warn',
        `Classes with too few examples: ${balance.underrepresented.join(', ')}.`,
      )
      recommendations.push(
        `These labels have too few examples to learn: ${balance.underrepresented.join(', ')}. ` +
          `Add more, or drop the class.`,
      )
    }
  }

  // ---- PII and secrets --------------------------------------------------------
  const piiFindings = detectPII(train)
  const piiSummary = summarisePII(piiFindings)

  if (piiSummary.highSeverityCount > 0) {
    add(
      'secrets-detected',
      'fail',
      `${piiSummary.highSeverityCount} high-severity secret(s) found in the dataset.`,
    )
    recommendations.push(
      `${piiSummary.highSeverityCount} apparent secret(s) — API keys or private keys — are in this ` +
        `dataset, first at line ${piiFindings.find((f) => f.severity === 'high')?.line}. Uploading ` +
        `publishes them to 0G Storage and trains a model to repeat them. Remove them and rotate the ` +
        `credentials.`,
    )
  }

  const lowerSeverityPII = piiSummary.total - piiSummary.highSeverityCount
  if (lowerSeverityPII > 0) {
    add('pii-detected', 'warn', `${lowerSeverityPII} possible personal-data match(es).`)
    recommendations.push(
      `${lowerSeverityPII} possible piece(s) of personal data (emails, phone numbers, IP ` +
        `addresses) appear on ${piiSummary.affectedLines.length} line(s), first at line ` +
        `${piiSummary.affectedLines[0]}. Fine-tuning data on 0G Storage is durable — redact first.`,
    )
  }

  const severity: Severity = issues.some((i) => i.severity === 'fail')
    ? 'fail'
    : issues.length > 0
      ? 'warn'
      : 'ok'

  return {
    severity,
    exampleCount: train.length,
    format: formats.dominant,
    issues,
    recommendations,
    duplicates: { exact, near, redundantCount, redundantFraction },
    ...(leakage === undefined ? {} : { leakage }),
    length,
    classBalance: balance,
    pii: { findings: piiFindings, ...piiSummary },
  }
}
