/**
 * The chars-per-token approximation — one copy, so the CLI and the orchestrator
 * cannot quote a user two different numbers for the same file.
 *
 * NOT A TOKENIZER. Nothing here looks at a vocabulary, a merge table or a
 * special token. It divides characters by a constant. A real Qwen tokenizer
 * means a model download, which this package will not take on: `@crucible/core`
 * has no runtime dependency beyond ethers and is meant to stay auditable at a
 * glance.
 *
 * NOT A BILLING FIGURE. The authority for anything involving money is the 0G
 * broker's `calculateToken` (docs/FIELD_NOTES.md:96), which runs the real
 * tokenizer against a dataset already staged with a provider. This estimate is
 * known to run high — packages/ml/README.md records it at roughly 2.3x on short
 * chat records, because a two-line chat record is mostly JSON punctuation and
 * field names. Anything printed from this module must be labelled an estimate at
 * the call site.
 *
 * WHY THE SERIALISED-JSON COUNT. Four copies of this idea existed and they did
 * not agree (see the note on `approximateTokenCount`). The behaviour kept here
 * is the orchestrator's, because the orchestrator is what priced the runs in
 * runs/ — a real task was funded against that number, so it is the one a user
 * has already been quoted, and changing it would silently reprice history.
 */

/**
 * Characters per token. The usual rough rule for this model family; it is not
 * derived from Qwen2.5's vocabulary and does not vary by format or language.
 */
export const CHARS_PER_TOKEN = 4

/** U+FEFF. A 0G dataset must not carry one; the estimator tolerates it anyway. */
const BYTE_ORDER_MARK = 0xfeff

/**
 * Approximate the token count of parsed dataset records.
 *
 * Counts the *serialised JSON* of each record — braces, field names, quotes and
 * all. That is deliberate and is why the figure runs high, but it is also why
 * this function needs to know nothing about the record's shape: 0G's three
 * dataset formats (chat / instruction / text) all go through the same path and
 * all come out comparable, and a record that matches no format still counts
 * rather than vanishing.
 *
 * The four implementations this replaces did not agree:
 *   - services/orchestrator/src/dataset.ts:56  serialised JSON / 4, min 1
 *   - packages/cli/src/tokens.ts:29 (deleted)  same, but 0 for an empty dataset
 *   - datasets/validate.mjs:120                natural-language payload only,
 *     plus 8 characters per chat turn for role markers — a much smaller number
 *   - packages/ml/src/analyze/records.ts:146   takes a string, not records
 *
 * The orchestrator's arithmetic wins here, for the reason given at the top of
 * the file. The one divergence from it is `[]`: the orchestrator's `Math.max(1, …)`
 * reports 1 token for a dataset with no records, which is a figure no run can
 * ever be priced at — 0G rejects anything under 10 examples — so an empty input
 * returns 0. Every input a real run can produce is byte-for-byte the
 * orchestrator's answer.
 */
export function approximateTokenCount(records: readonly unknown[]): number {
  let characters = 0
  for (const record of records) {
    // `undefined`, and functions, serialise to `undefined` rather than a string.
    characters += JSON.stringify(record)?.length ?? 0
  }
  if (characters === 0) return 0
  // A record shorter than one token still costs a token; never round down to 0.
  return Math.max(1, Math.ceil(characters / CHARS_PER_TOKEN))
}

/**
 * Parse a JSONL file's records, skipping anything unparseable.
 *
 * Estimating is a preview, not validation — `validateDatasetFile` is where a
 * malformed line is meant to be reported, with its line number. A bad line here
 * simply does not count towards the estimate, so a single stray line cannot stop
 * a user seeing what their dataset will cost.
 */
export function parseJsonlLoosely(content: string): unknown[] {
  const records: unknown[] = []
  // Strip a leading BOM. Done by code point rather than by a literal character in
  // a regex, which is invisible in a diff and easy to delete by accident.
  // `JSON.parse` rejects a BOM, and it belongs to the file rather than to the
  // first record.
  const text = content.charCodeAt(0) === BYTE_ORDER_MARK ? content.slice(1) : content

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    try {
      records.push(JSON.parse(trimmed))
    } catch {
      // reported by validateDatasetFile, ignored by the estimator
    }
  }
  return records
}

/** Convenience for the common case: JSONL text in, approximate token count out. */
export function approximateTokenCountForJsonl(content: string): number {
  return approximateTokenCount(parseJsonlLoosely(content))
}
