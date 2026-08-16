/**
 * Conversion between 0G's three dataset formats.
 *
 * This module exists because the claim came first. `docs/ARCHITECTURE.md`, the
 * architecture diagram ("validate · convert · estimate · canonicalise") and the
 * demo script all said `@crucible/core` converts datasets. It did not — the only
 * conversion in the package was records-to-JSONL, and the one real field remap in
 * the repository lived in a single-use build script for the Dolly slice. Rather
 * than delete a fifth capability claim, here is the capability.
 *
 * ## The rule this module follows
 *
 * **Never silently lose a field.** A conversion either preserves everything, or
 * the record is skipped and the caller is told which line and what would have
 * been lost. For a project whose entire subject is provenance, a converter that
 * quietly drops a system prompt would be self-refuting.
 *
 * ## The mapping, and why
 *
 * `instruction` and `chat` are both structured, so they round-trip exactly:
 *
 * ```
 * {instruction, input, output}  ⇄  [{system: input}?, {user: instruction}, {assistant: output}]
 * ```
 *
 * Mapping `input` to a system message rather than concatenating it onto the user
 * turn is a deliberate choice. The Alpaca convention builds a prompt string as
 * `instruction + "\n\n" + input`, which is right for *prompting* and wrong for
 * *converting a dataset*: it fuses two fields into one and the original boundary
 * can never be recovered. Keeping them in separate messages means
 * `toChat(toInstruction(x))` returns `x`, which is a property the tests assert.
 *
 * `text` is an unstructured continuation format. Converting *to* it is supported
 * and permanently lossy, so it is labelled as such. Converting *from* it is not
 * supported at all: there is no structure to recover, and guessing one would be
 * inventing provenance rather than preserving it.
 */

import { detectFormat, type DatasetFormat } from './dataset.js'

/** A record that could not be converted, and precisely why. */
export interface SkippedRecord {
  /** 1-based line number, matching how every validator in this repo reports. */
  line: number
  /** The format the record was detected as, or null if it matched none. */
  from: DatasetFormat | null
  /** What would have been lost or invented. Written for a human to act on. */
  reason: string
}

export interface ConversionResult {
  /** Converted records, in input order. Excludes anything skipped. */
  records: unknown[]
  /** Records already in the target format, passed through untouched. */
  unchanged: number
  /** Records actually rewritten. */
  converted: number
  /** Everything that did not convert, with a reason each. */
  skipped: SkippedRecord[]
  /**
   * True if any conversion performed discarded structure that cannot be
   * recovered — currently only conversions to `text`.
   */
  lossy: boolean
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

interface ChatMessage {
  role: string
  content: string
}

function messagesOf(record: unknown): ChatMessage[] | null {
  if (!isObject(record)) return null
  const { messages } = record
  if (!Array.isArray(messages)) return null
  return messages as ChatMessage[]
}

/**
 * Convert one record to `instruction` shape.
 *
 * Returns a reason string instead of a record when the conversion would lose
 * something. Multi-turn conversations are the main case: `{instruction, input,
 * output}` has exactly one exchange in it, so a four-message dialogue has
 * nowhere to go.
 */
function toInstruction(record: unknown, from: DatasetFormat): unknown | string {
  if (from === 'instruction') return record

  if (from === 'text') {
    return 'text records carry no instruction/output boundary; recovering one would mean inventing it'
  }

  const messages = messagesOf(record)
  if (!messages) return 'record has no messages array'

  const system = messages.filter((m) => m.role === 'system')
  const rest = messages.filter((m) => m.role !== 'system')

  if (system.length > 1) {
    return `${system.length} system messages, and the instruction format has one input field`
  }
  if (rest.length !== 2) {
    return (
      `${rest.length} non-system message(s); the instruction format holds exactly one ` +
      `user/assistant exchange, so this would lose ${Math.max(0, rest.length - 2)} turn(s)`
    )
  }

  const [first, second] = rest as [ChatMessage, ChatMessage]
  if (first.role !== 'user' || second.role !== 'assistant') {
    return `expected a user message followed by an assistant message, got "${first.role}" then "${second.role}"`
  }

  return {
    instruction: first.content,
    input: system[0]?.content ?? '',
    output: second.content,
  }
}

/** Convert one record to `chat` shape. The inverse of `toInstruction`. */
function toChat(record: unknown, from: DatasetFormat): unknown | string {
  if (from === 'chat') return record

  if (from === 'text') {
    return 'text records carry no role boundaries; assigning them would mean inventing them'
  }

  if (!isObject(record)) return 'record is not an object'
  const instruction = record['instruction']
  const output = record['output']
  const input = record['input']

  if (typeof instruction !== 'string' || typeof output !== 'string') {
    return 'record is missing a string instruction or output'
  }

  const messages: ChatMessage[] = []
  if (typeof input === 'string' && input.length > 0) {
    messages.push({ role: 'system', content: input })
  }
  messages.push({ role: 'user', content: instruction })
  messages.push({ role: 'assistant', content: output })

  return { messages }
}

/**
 * Convert one record to `text` shape.
 *
 * Always succeeds from a structured format, and always loses the structure. The
 * caller is told via `ConversionResult.lossy` rather than per record, because
 * every record converted this way is lossy in the same way.
 */
function toText(record: unknown, from: DatasetFormat): unknown | string {
  if (from === 'text') return record

  if (from === 'chat') {
    const messages = messagesOf(record)
    if (!messages) return 'record has no messages array'
    return { text: messages.map((m) => `${m.role}: ${m.content}`).join('\n') }
  }

  if (!isObject(record)) return 'record is not an object'
  const instruction = record['instruction']
  const output = record['output']
  const input = record['input']
  if (typeof instruction !== 'string' || typeof output !== 'string') {
    return 'record is missing a string instruction or output'
  }
  const head = typeof input === 'string' && input.length > 0 ? `${instruction}\n\n${input}` : instruction
  return { text: `${head}\n\n${output}` }
}

/**
 * Convert a whole dataset to one 0G format.
 *
 * Every record is converted independently, so one unconvertible line does not
 * fail the file — it is reported and the rest proceed. That mirrors how
 * `validateDataset` reports rather than throws.
 *
 * @param records already-parsed records, in file order
 * @param target the 0G format to produce
 */
export function convertDataset(records: unknown[], target: DatasetFormat): ConversionResult {
  const out: unknown[] = []
  const skipped: SkippedRecord[] = []
  let converted = 0
  let unchanged = 0
  let lossy = false

  for (const [index, record] of records.entries()) {
    const line = index + 1
    const from = detectFormat(record)

    if (from === null) {
      skipped.push({
        line,
        from: null,
        reason: "matches none of 0G's three formats, so there is nothing to convert from",
      })
      continue
    }

    const result =
      target === 'instruction'
        ? toInstruction(record, from)
        : target === 'chat'
          ? toChat(record, from)
          : toText(record, from)

    if (typeof result === 'string') {
      skipped.push({ line, from, reason: result })
      continue
    }

    if (from === target) {
      unchanged++
    } else {
      converted++
      if (target === 'text') lossy = true
    }
    out.push(result)
  }

  return { records: out, converted, unchanged, skipped, lossy }
}
