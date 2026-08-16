/**
 * Rough token counting for the cost preview.
 *
 * `@crucible/core` has no tokenizer and should not grow one — a real Qwen
 * tokenizer means a model download. This is the same ~4-characters-per-token
 * approximation the rest of the repository already uses
 * (services/orchestrator/src/dataset.ts:61, packages/ml/src/analyze/records.ts:146,
 * datasets/validate.mjs:32), reproduced here rather than imported because those
 * are not this package's to depend on.
 *
 * It is deliberately not a billing figure. packages/ml/README.md records the
 * estimator as "not a billing figure" and points at the broker's
 * `calculateToken` (docs/FIELD_NOTES.md:96) for anything involving money — that
 * needs a dataset already staged against a provider, which `doctor` has not got.
 * So anything printed from this module must be labelled an estimate at the call
 * site.
 */

/** The usual rough rule for this model family. Not the Qwen tokenizer. */
export const CHARS_PER_TOKEN = 4

/**
 * Estimate tokens across parsed records.
 *
 * Counts the serialised JSON, matching the orchestrator, so the two agree on
 * the same file. That includes field names and punctuation, which is part of
 * why the figure runs high.
 */
export function estimateTokenCount(records: unknown[]): number {
  let characters = 0
  for (const record of records) {
    characters += JSON.stringify(record)?.length ?? 0
  }
  if (characters === 0) return 0
  return Math.max(1, Math.ceil(characters / CHARS_PER_TOKEN))
}

/**
 * Parse a JSONL file's records, skipping anything unparseable.
 *
 * Counting is a preview, not validation — `crucible validate` is where a
 * malformed line is meant to be reported. A bad line here simply does not count.
 */
export function parseJsonlLoosely(content: string): unknown[] {
  const records: unknown[] = []
  for (const line of content.replace(/^\ufeff/, '').split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    try {
      records.push(JSON.parse(trimmed))
    } catch {
      // reported by `crucible validate`, ignored by the estimator
    }
  }
  return records
}
