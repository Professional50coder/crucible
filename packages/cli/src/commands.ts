/**
 * The file-inspection commands: validate, convert, config.
 *
 * Each one is a thin wrapper over `@crucible/core`. None of them reimplements a
 * rule — the rules live in core, where they are tested against a corpus, and
 * duplicating one here would create a second source of truth that drifts.
 *
 * Every function in this module is pure: content in, `{ code, lines }` out. The
 * caller does the file I/O and the printing. That is what lets the tests assert
 * on exact output without a filesystem, and it keeps the standing rule in
 * docs/INTERFACES.md:270 (no test needs a key, funds, or a network) trivially
 * satisfied for this whole surface.
 */
import {
  convertDataset,
  recordsToJsonl,
  validateDatasetFile,
  validateTrainingConfig,
  type DatasetFormat,
} from '@crucible/core'
import { c, bad, ok, warn } from './format.js'

export interface CommandResult {
  /** Process exit code. 0 clean, 1 any error — the convention the repo scripts expect. */
  code: number
  /** Lines for stderr/stdout status output, already coloured. */
  lines: string[]
  /** Payload for `--out` or stdout, when the command produces a file. */
  output?: string
}

export const DATASET_FORMATS: readonly DatasetFormat[] = ['chat', 'instruction', 'text']

export function isDatasetFormat(v: string): v is DatasetFormat {
  return (DATASET_FORMATS as readonly string[]).includes(v)
}

/**
 * `crucible validate` — byte-level and record-level dataset checks.
 *
 * Uses `validateDatasetFile` rather than `validateDataset` deliberately: the
 * file-level entry point is the only one that can see a BOM, CRLF endings or a
 * blank line, and CRLF is the failure that survives record-level validation and
 * gets rejected only after upload (packages/core/src/dataset.ts:112).
 */
export function validateCommand(content: string, label: string): CommandResult {
  const errors = validateDatasetFile(content)

  if (errors.length === 0) {
    return { code: 0, lines: [`  ${ok} ${label} is a valid 0G dataset`] }
  }

  return {
    code: 1,
    lines: [
      `  ${bad} ${errors.length} problem${errors.length === 1 ? '' : 's'} in ${label}`,
      ...errors.map((e) => `     ${e}`),
    ],
  }
}

/**
 * `crucible config` — training-config validation.
 *
 * A config with an extra parameter is accepted by the CLI and rejected by the
 * broker *after* the task is created and funded, so this check is worth running
 * before money moves (packages/core/src/training-config.ts:1).
 */
export function configCommand(content: string, label: string): CommandResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (e) {
    return {
      code: 1,
      lines: [`  ${bad} ${label} is not valid JSON`, `     ${e instanceof Error ? e.message : String(e)}`],
    }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { code: 1, lines: [`  ${bad} ${label} must be a JSON object of the five 0G parameters`] }
  }

  const errors = validateTrainingConfig(parsed as Record<string, unknown>)

  if (errors.length === 0) {
    return { code: 0, lines: [`  ${ok} ${label} is a valid 0G training config`] }
  }

  return {
    code: 1,
    lines: [
      `  ${bad} ${errors.length} problem${errors.length === 1 ? '' : 's'} in ${label}`,
      ...errors.map((e) => `     ${e}`),
    ],
  }
}

/**
 * `crucible convert` — move a dataset between 0G's three formats.
 *
 * Reports every skipped record individually. `convertDataset`'s contract is that
 * it never silently loses a field (packages/core/src/convert.ts:12), and that
 * promise is only kept if the CLI actually prints what was skipped rather than
 * summarising it away.
 *
 * Skipped records do not fail the command. One unconvertible line out of a
 * thousand should still produce the other 999, which is why core reports rather
 * than throws. The exit code is 1 only when nothing came out at all.
 */
export function convertCommand(
  content: string,
  target: DatasetFormat,
  label: string,
): CommandResult {
  const errors: string[] = []
  const records: unknown[] = []
  // core reports skips by *record* index; blank and unparseable lines are not
  // records, so record index and file line diverge. Keep the map so the user is
  // told the line they can actually go and open.
  const sourceLine: number[] = []

  for (const [index, line] of content.replace(/^\ufeff/, '').split('\n').entries()) {
    if (line.trim() === '') continue
    try {
      records.push(JSON.parse(line))
      sourceLine.push(index + 1)
    } catch {
      errors.push(`Line ${index + 1} is not valid JSON and was not read.`)
    }
  }

  if (records.length === 0) {
    return {
      code: 1,
      lines: [`  ${bad} no readable JSON records in ${label}`, ...errors.map((e) => `     ${e}`)],
    }
  }

  const result = convertDataset(records, target)
  const lines: string[] = []

  lines.push(
    `  ${c.bold(`${label} → ${target}`)}` +
      c.dim(`  ·  ${result.converted} converted, ${result.unchanged} already ${target}`),
  )

  for (const e of errors) lines.push(`  ${warn} ${e}`)

  for (const s of result.skipped) {
    const line = sourceLine[s.line - 1] ?? s.line
    lines.push(`  ${warn} line ${line} skipped (${s.from ?? 'unrecognised format'}): ${s.reason}`)
  }

  if (result.lossy) {
    // Stated outright rather than as a footnote: converting to `text` destroys
    // the role boundaries permanently and there is no inverse conversion.
    lines.push(
      `  ${warn} ${c.yellow('LOSSY')} — converting to text discards role/field structure. ` +
        `It cannot be converted back; keep the original.`,
    )
  }

  if (result.records.length === 0) {
    lines.push(`  ${bad} nothing converted`)
    return { code: 1, lines }
  }

  return { code: 0, lines, output: recordsToJsonl(result.records) }
}
