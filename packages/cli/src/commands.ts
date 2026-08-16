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
  buildModelCard,
  canonicalize,
  convertDataset,
  manifestHash,
  recordsToJsonl,
  validateDatasetFile,
  validateTrainingConfig,
  verifyManifest,
  type DatasetFormat,
  type PassportManifest,
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
 * Read a manifest file into an object, or say why it is not one.
 *
 * Shared by verify and card so the two report a broken file identically.
 */
function readManifest(
  content: string,
  label: string,
): { manifest?: Record<string, unknown>; result?: CommandResult } {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (e) {
    return {
      result: {
        code: 1,
        lines: [
          `  ${bad} ${label} is not valid JSON`,
          `     ${e instanceof Error ? e.message : String(e)}`,
        ],
      },
    }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { result: { code: 1, lines: [`  ${bad} ${label} must be a JSON object`] } }
  }

  return { manifest: parsed as Record<string, unknown> }
}

/**
 * `crucible verify` — recompute a manifest's keccak256 from the file itself.
 *
 * This is the project's central claim reduced to one command: anyone holding the
 * manifest can recompute the anchored hash without trusting Crucible, a server,
 * or an indexer.
 *
 * It deliberately does **not** require the current `PassportManifest` shape.
 * `canonicalize` is structural — sort keys recursively, emit no whitespace — and
 * the only manifest actually anchored on chain (runs/manifest-1.json) is the
 * earlier flat shape from before the passport gained its sections. A verifier
 * that rejected the one manifest a user can check against the chain today would
 * be verifying nothing. The cast is the honest expression of that: the hash is a
 * function of the bytes, not of the type.
 */
export function verifyCommand(content: string, label: string, expected?: string): CommandResult {
  const { manifest, result } = readManifest(content, label)
  if (result) return result

  const typed = manifest as unknown as PassportManifest

  let hash: string
  let canonical: string
  try {
    canonical = canonicalize(typed)
    hash = manifestHash(typed)
  } catch (e) {
    // canonicalize throws by design on NaN/Infinity/bigint — values JSON would
    // silently turn into something else, producing a wrong hash quietly.
    return {
      code: 1,
      lines: [
        `  ${bad} ${label} cannot be canonicalized`,
        `     ${e instanceof Error ? e.message : String(e)}`,
      ],
    }
  }

  const lines = [
    `  ${c.bold(label)}` + c.dim(`  ·  ${canonical.length} canonical bytes`),
    `  keccak256  ${c.cyan(hash)}`,
  ]

  if (expected === undefined) {
    // No --expect is not a pass or a failure: it is a computation. Say what the
    // user still has to do for it to mean anything.
    lines.push(c.dim('     compare it against the anchored hash with --expect <0x…>'))
    return { code: 0, lines, output: `${hash}\n` }
  }

  if (verifyManifest(typed, expected)) {
    return {
      code: 0,
      lines: [...lines, `  ${ok} matches the expected hash`],
      output: `${hash}\n`,
    }
  }

  return {
    code: 1,
    lines: [
      ...lines,
      `  ${bad} does not match the expected hash`,
      `     expected  ${expected.trim()}`,
      `     computed  ${hash}`,
      `     ${c.dim('one byte of the manifest differs from the one that was anchored')}`,
    ],
    output: `${hash}\n`,
  }
}

/**
 * `crucible card` — the Hugging Face model card for a passport.
 *
 * Unlike verify, this one needs the full manifest shape: `buildModelCard` reads
 * the task, base, dataset, training, fee and tee sections by name and there is
 * nothing sensible to print without them. It throws on a manifest missing them,
 * so the throw is caught and reported as a file problem rather than a stack
 * trace — the likely file a user points at is an older flat manifest.
 */
export function cardCommand(content: string, label: string, license?: string): CommandResult {
  const { manifest, result } = readManifest(content, label)
  if (result) return result

  const typed = manifest as unknown as PassportManifest

  try {
    const card = buildModelCard(typed, license === undefined ? {} : { license })
    return {
      code: 0,
      lines: [
        `  ${ok} model card for ${c.bold(label)}` +
          c.dim(license === undefined ? '  ·  no licence declared' : `  ·  licence ${license}`),
      ],
      output: card,
    }
  } catch (e) {
    return {
      code: 1,
      lines: [
        `  ${bad} cannot build a model card from ${label}`,
        `     ${e instanceof Error ? e.message : String(e)}`,
        `     ${c.dim('card needs a full passport manifest — the sections buildManifest writes')}`,
      ],
    }
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
