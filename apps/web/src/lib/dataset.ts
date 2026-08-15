/**
 * Client-side dataset validation.
 *
 * 0G accepts three JSONL record shapes and requires one format used consistently
 * across the whole file, UTF-8, at least 10 examples, and no blank lines. A file
 * that breaks any of these is rejected *after* upload and *after* funds move, so
 * the browser checks it first and says exactly which line is wrong.
 *
 * This mirrors the rules in `@crucible/core`; the duplication is deliberate so
 * the web app validates without a network round-trip and without a build-time
 * dependency on a package that is being written concurrently.
 */

import type { DatasetFormat } from './types'

/** 0G's stated minimum. Real behaviour change needs 200–1,000 for Qwen2.5-0.5B. */
export const MINIMUM_EXAMPLES = 10

/** Below this, training runs but the model will not measurably change. */
export const RECOMMENDED_EXAMPLES = 200

const MAX_REPORTED_LINES = 5

export type IssueSeverity = 'error' | 'warning'

export interface DatasetIssue {
  severity: IssueSeverity
  /** 1-based line number in the source file, when the issue is line-specific. */
  line?: number
  message: string
  /** What to actually do about it. */
  fix?: string
}

export interface DatasetAnalysis {
  valid: boolean
  format: DatasetFormat | null
  exampleCount: number
  /** Rough token estimate — the broker counts for real at task creation. */
  tokenCount: number
  issues: DatasetIssue[]
  formatCounts: Partial<Record<DatasetFormat, number>>
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isString = (v: unknown): v is string => typeof v === 'string'

export function detectFormat(record: unknown): DatasetFormat | null {
  if (!isObject(record)) return null

  const { messages, instruction, input, output, text } = record

  if (
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.every((m) => isObject(m) && isString(m['role']) && isString(m['content']))
  ) {
    return 'chat'
  }

  // `input` is optional-but-present in 0G's examples; an empty string is valid.
  if (isString(instruction) && isString(output) && (input === undefined || isString(input))) {
    return 'instruction'
  }

  if (isString(text)) return 'text'

  return null
}

/** Extract the trainable text of a record, for token estimation. */
function textOf(record: unknown, format: DatasetFormat): string {
  if (!isObject(record)) return ''

  if (format === 'chat') {
    const messages = record['messages']
    if (!Array.isArray(messages)) return ''
    return messages
      .map((m) => (isObject(m) && isString(m['content']) ? m['content'] : ''))
      .join(' ')
  }

  if (format === 'instruction') {
    return [record['instruction'], record['input'], record['output']]
      .filter(isString)
      .join(' ')
  }

  return isString(record['text']) ? record['text'] : ''
}

/**
 * ~4 characters per token. This is the standard rule of thumb and is honest
 * about being an estimate — the UI labels the resulting fee as such, because
 * the broker's `calculateToken` is the number that actually gets charged.
 */
export const CHARS_PER_TOKEN = 4

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/**
 * Parse and validate a raw JSONL file.
 *
 * Blank lines are reported rather than silently skipped: 0G rejects them, and a
 * user whose editor added a trailing blank line deserves to be told that rather
 * than watching a funded task fail.
 */
export function analyseJsonl(source: string): DatasetAnalysis {
  const issues: DatasetIssue[] = []
  const lines = source.split(/\r?\n/)

  const records: Array<{ line: number; value: unknown }> = []
  const parseErrors: Array<{ line: number; message: string }> = []
  const blankLines: number[] = []

  lines.forEach((raw, index) => {
    const lineNumber = index + 1
    const trimmed = raw.trim()

    if (trimmed === '') {
      // A single trailing newline at end-of-file is correct JSONL, not a blank line.
      const isTrailingNewline = index === lines.length - 1
      if (!isTrailingNewline) blankLines.push(lineNumber)
      return
    }

    try {
      records.push({ line: lineNumber, value: JSON.parse(trimmed) })
    } catch (error) {
      parseErrors.push({
        line: lineNumber,
        message: error instanceof Error ? error.message : 'Invalid JSON',
      })
    }
  })

  for (const blank of blankLines.slice(0, MAX_REPORTED_LINES)) {
    issues.push({
      severity: 'error',
      line: blank,
      message: 'Blank line inside the file.',
      fix: '0G rejects blank lines between records. Delete it.',
    })
  }
  if (blankLines.length > MAX_REPORTED_LINES) {
    issues.push({
      severity: 'error',
      message: `…and ${blankLines.length - MAX_REPORTED_LINES} more blank lines.`,
    })
  }

  for (const parseError of parseErrors.slice(0, MAX_REPORTED_LINES)) {
    issues.push({
      severity: 'error',
      line: parseError.line,
      message: `Not valid JSON — ${parseError.message}`,
      fix: 'Each line must be one complete JSON object. Check for a trailing comma or an unescaped quote.',
    })
  }
  if (parseErrors.length > MAX_REPORTED_LINES) {
    issues.push({
      severity: 'error',
      message: `…and ${parseErrors.length - MAX_REPORTED_LINES} more unparseable lines.`,
    })
  }

  const formatCounts: Partial<Record<DatasetFormat, number>> = {}
  const firstLineOf = new Map<DatasetFormat, number>()
  const unrecognised: number[] = []
  let characters = 0

  for (const { line, value } of records) {
    const format = detectFormat(value)

    if (format === null) {
      unrecognised.push(line)
      continue
    }

    formatCounts[format] = (formatCounts[format] ?? 0) + 1
    if (!firstLineOf.has(format)) firstLineOf.set(format, line)
    characters += textOf(value, format).length
  }

  for (const line of unrecognised.slice(0, MAX_REPORTED_LINES)) {
    issues.push({
      severity: 'error',
      line,
      message: 'Matches none of 0G’s three formats.',
      fix: 'Expected {"messages":[…]}, or {"instruction","input","output"}, or {"text"}.',
    })
  }
  if (unrecognised.length > MAX_REPORTED_LINES) {
    issues.push({
      severity: 'error',
      message:
        `…and ${unrecognised.length - MAX_REPORTED_LINES} more unrecognised lines ` +
        `(${unrecognised.length} of ${records.length} records match no 0G format).`,
    })
  }

  const present = Object.entries(formatCounts) as Array<[DatasetFormat, number]>
  const ranked = [...present].sort((a, b) => b[1] - a[1])
  const format = ranked.length > 0 ? ranked[0]![0] : null

  if (ranked.length > 1) {
    const summary = ranked
      .map(([f, n]) => `${f} (${n} record${n === 1 ? '' : 's'})`)
      .join(', ')
    const minorityFormat = ranked[ranked.length - 1]![0]

    issues.push({
      severity: 'error',
      line: firstLineOf.get(minorityFormat),
      message: `Dataset mixes formats: ${summary}.`,
      fix: `0G requires one format throughout. Line ${firstLineOf.get(minorityFormat)} is the first "${minorityFormat}" record — convert it or the rest.`,
    })
  }

  const exampleCount = records.length - unrecognised.length

  if (records.length === 0) {
    issues.push({
      severity: 'error',
      message: 'File contains no records.',
      fix: 'Expected JSONL — one JSON object per line.',
    })
  } else if (exampleCount < MINIMUM_EXAMPLES) {
    issues.push({
      severity: 'error',
      message: `Dataset has ${exampleCount} valid example${exampleCount === 1 ? '' : 's'}. 0G requires at least ${MINIMUM_EXAMPLES}.`,
      fix: `Add ${MINIMUM_EXAMPLES - exampleCount} more.`,
    })
  } else if (exampleCount < RECOMMENDED_EXAMPLES) {
    issues.push({
      severity: 'warning',
      message: `${exampleCount} examples is above 0G’s minimum but below the ${RECOMMENDED_EXAMPLES}–1,000 range 0G recommends for Qwen2.5-0.5B.`,
      fix: 'The run will succeed; the model’s behaviour may not measurably change.',
    })
  }

  const valid = !issues.some((issue) => issue.severity === 'error')

  return {
    valid,
    format,
    exampleCount,
    tokenCount: estimateTokens('x'.repeat(characters)),
    issues,
    formatCounts,
  }
}
