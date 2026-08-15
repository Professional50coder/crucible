/**
 * Record normalisation — one shape for the three 0G dataset formats.
 *
 * Every analyser downstream works on `NormalisedRecord`, so duplicate detection,
 * leakage detection, length stats and PII scanning all behave identically whether
 * the user shipped chat, instruction or text JSONL.
 *
 * `detectFormat` mirrors the validator in packages/core/src/dataset.ts. It is a
 * deliberate reimplementation rather than an import: core is owned by another
 * agent, and this package must not depend on it. If the two ever disagree, core
 * is the authority and this file is the bug.
 */

export type DatasetFormat = 'chat' | 'instruction' | 'text'

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

  if (isString(instruction) && isString(output) && (input === undefined || isString(input))) {
    return 'instruction'
  }

  if (isString(text)) return 'text'

  return null
}

export interface NormalisedRecord {
  /** 1-based JSONL line number — what the user sees in their editor. */
  line: number
  format: DatasetFormat | null
  /** The prompt side: system + user turns, or instruction + input. Empty for text. */
  input: string
  /** The answer side: last assistant turn, or `output`. Empty for text. */
  output: string
  /** Everything, prompt and answer together. The dedup key. */
  full: string
  /**
   * What leakage compares on: the prompt when there is one, otherwise the whole
   * record. A test question that also appears in training is the leak that matters,
   * whether or not the answers happen to match.
   */
  key: string
  raw: unknown
}

function fallbackText(record: unknown): string {
  if (typeof record === 'string') return record
  try {
    return JSON.stringify(record) ?? String(record)
  } catch {
    return String(record)
  }
}

export function normaliseRecord(record: unknown, line: number): NormalisedRecord {
  const format = detectFormat(record)

  let input = ''
  let output = ''
  let full = ''

  // What leakage compares on. Differs from `input` only for chat records — see
  // the system-prompt note below.
  let comparable = ''

  if (format === 'chat') {
    const messages = (record as { messages: Array<{ role: string; content: string }> }).messages
    const promptTurns = messages.filter((m) => m.role !== 'assistant')
    const assistantTurns = messages.filter((m) => m.role === 'assistant')

    input = promptTurns.map((m) => m.content).join('\n')
    output = assistantTurns.at(-1)?.content ?? ''
    full = messages.map((m) => `${m.role}: ${m.content}`).join('\n')

    /**
     * System turns are excluded from the leakage key.
     *
     * A constant system prompt is *correct* dataset design — 0G's docs recommend
     * one for classification tasks — so it appears verbatim in every record. Left
     * in, it dominates the similarity of any dataset whose user content is short.
     *
     * Measured on Crucible's own sentiment set: "It arrived." vs "Arrived
     * damaged." (different text, different labels) scored 0.8137 with an
     * 84-character system prompt included, and 0.1875 on user content alone. The
     * boilerplate cleared the 0.75 threshold by itself, so every well-built
     * system-prompted dataset would have been reported as contaminated.
     *
     * `full` deliberately keeps the system turn — exact-duplicate detection
     * should still treat two byte-identical records as duplicates.
     */
    const userTurns = promptTurns.filter((m) => m.role !== 'system')
    comparable = userTurns.map((m) => m.content).join('\n')
  } else if (format === 'instruction') {
    const r = record as { instruction: string; input?: string; output: string }
    input = [r.instruction, r.input ?? ''].filter((s) => s !== '').join('\n')
    output = r.output
    full = `${input}\n${output}`
  } else if (format === 'text') {
    full = (record as { text: string }).text
  } else {
    full = fallbackText(record)
  }

  return {
    line,
    format,
    input,
    output,
    full,
    // Prefer the boilerplate-free comparable text; fall back to the full prompt,
    // then to the whole record for formats with no prompt side (text completion).
    key: comparable !== '' ? comparable : input !== '' ? input : full,
    raw: record,
  }
}

export function normaliseRecords(records: readonly unknown[]): NormalisedRecord[] {
  return records.map((record, index) => normaliseRecord(record, index + 1))
}

/**
 * Cheap token estimate: ~4 characters per token.
 *
 * This is NOT the Qwen tokenizer and does not pretend to be — a real tokenizer
 * would mean a model download, which the constraints rule out and which would be
 * disproportionate for a pre-flight sanity check. Treat these numbers as an order
 * of magnitude for spotting outliers, not as a billing figure. `calculateToken`
 * on the 0G broker is the authority for anything involving money.
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0
  return Math.ceil(text.length / 4)
}
