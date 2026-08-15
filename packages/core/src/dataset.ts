/**
 * Dataset handling for 0G Compute fine-tuning.
 *
 * 0G accepts three JSONL record shapes and requires one format used consistently
 * across the whole file, UTF-8, at least 10 examples, and no blank lines. A file
 * that breaks any of these is rejected after upload, so we check locally first.
 *
 * Formats (docs.0g.ai + fine-tuning-example/dataset/README.md):
 *   chat        {"messages":[{"role","content"}, …]}   ← recommended for instruct models
 *   instruction {"instruction","input","output"}        ← `input` may be empty
 *   text        {"text"}
 */

export type DatasetFormat = 'chat' | 'instruction' | 'text'

/** 0G's stated minimum. Real behaviour change needs 200–1,000 for Qwen2.5-0.5B. */
export const MINIMUM_EXAMPLES = 10

/** Cap on per-line errors before summarising, so a wholly malformed file stays readable. */
const MAX_REPORTED_LINES = 5

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

export function validateDataset(records: unknown[]): string[] {
  const errors: string[] = []

  if (records.length < MINIMUM_EXAMPLES) {
    errors.push(
      `Dataset has ${records.length} examples. 0G requires at least ${MINIMUM_EXAMPLES}.`,
    )
  }

  const counts = new Map<DatasetFormat, number>()
  const firstLineOf = new Map<DatasetFormat, number>()
  const unrecognised: number[] = []

  for (const [index, record] of records.entries()) {
    const format = detectFormat(record)

    if (format === null) {
      unrecognised.push(index + 1)
      continue
    }

    counts.set(format, (counts.get(format) ?? 0) + 1)
    if (!firstLineOf.has(format)) firstLineOf.set(format, index + 1)
  }

  // A wholly malformed file would otherwise emit one error per line. Name the
  // first few so the user can go and look, then summarise.
  for (const line of unrecognised.slice(0, MAX_REPORTED_LINES)) {
    errors.push(
      `Line ${line} matches none of 0G's three formats (chat messages, instruction, text).`,
    )
  }

  if (unrecognised.length > MAX_REPORTED_LINES) {
    errors.push(
      `…and ${unrecognised.length - MAX_REPORTED_LINES} more unrecognised lines ` +
        `(${unrecognised.length} of ${records.length} records match no 0G format).`,
    )
  }

  if (counts.size > 1) {
    // Majority format is the intended one; the odd format out is the mistake.
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
    const summary = ranked
      .map(([f, n]) => `${f} (${n} record${n === 1 ? '' : 's'})`)
      .join(', ')
    const [minorityFormat] = ranked[ranked.length - 1]!

    errors.push(
      `Dataset mixes formats: ${summary}. 0G requires one format throughout — ` +
        `line ${firstLineOf.get(minorityFormat)} is the first "${minorityFormat}" record.`,
    )
  }

  return errors
}

/** Compact JSONL: one object per line, trailing newline, never a blank line between records. */
export function recordsToJsonl(records: unknown[]): string {
  return records.map((r) => JSON.stringify(r)).join('\n') + '\n'
}

/**
 * File-level validation — checks the raw bytes, then the parsed records.
 *
 * `validateDataset` receives already-parsed records, so it structurally cannot
 * see anything that lives in the bytes. The dangerous case is CRLF: `JSON.parse`
 * silently tolerates a trailing \r, so a Windows-authored dataset passes
 * record-level validation and reaches 0G unflagged. On Windows that is the
 * default line ending, which makes it a live risk rather than a theoretical one.
 *
 * Found by cross-running this module against an independent validator over a
 * deliberately-invalid corpus — neither implementation alone would have caught it.
 */
export function validateDatasetFile(content: string): string[] {
  const errors: string[] = []

  if (content.startsWith('\ufeff')) {
    errors.push('File starts with a UTF-8 BOM. Strip it — 0G requires clean UTF-8.')
  }

  const text = content.replace(/^\ufeff/, '')

  if (text.length === 0) return ['File is empty.']

  if (text.includes('\r\n')) {
    errors.push(
      'File uses CRLF line endings. 0G requires LF line endings only - JSON.parse ' +
        'silently tolerates the trailing carriage return, so this survives ' +
        'record-level validation.',
    )
  }

  if (text.trimStart().startsWith('[')) {
    errors.push('File looks like a JSON array. JSONL requires one JSON object per line.')
  }

  const lines = text.split('\n')
  if (lines[lines.length - 1] === '') lines.pop() // a single trailing newline is correct

  const records: unknown[] = []

  for (const [index, line] of lines.entries()) {
    const lineNo = index + 1

    if (line.trim() === '') {
      errors.push(`Line ${lineNo} is blank. 0G rejects blank lines between records.`)
      continue
    }
    if (/,\s*$/.test(line)) {
      errors.push(`Line ${lineNo} ends with a comma. Each line must be a standalone JSON object.`)
      continue
    }

    try {
      records.push(JSON.parse(line))
    } catch {
      errors.push(`Line ${lineNo} is not valid JSON.`)
    }
  }

  return [...errors, ...validateDataset(records)]
}
