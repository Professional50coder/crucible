#!/usr/bin/env node
/**
 * Builds datasets/dolly-slice/{train,test}.jsonl from databricks-dolly-15k.
 *
 * Usage:
 *   curl -sL -o /tmp/databricks-dolly-15k.jsonl \
 *     https://huggingface.co/datasets/databricks/databricks-dolly-15k/resolve/main/databricks-dolly-15k.jsonl
 *   node datasets/build-dolly-slice.mjs --source /tmp/databricks-dolly-15k.jsonl
 *
 * Source: databricks/databricks-dolly-15k — Apache 2.0, human-authored by
 * Databricks employees. Chosen precisely because its provenance is
 * unambiguous: a provenance product must be able to state where its own
 * training data came from. (Alpaca / alpaca-cleaned is deliberately NOT used
 * — it is GPT-3.5-generated and its commercial provenance is murky.)
 *
 * FIELD MAPPING — Dolly to 0G's instruction format:
 *   instruction -> instruction   (unchanged)
 *   context     -> input         (renamed; may be "")
 *   response    -> output        (renamed)
 *   category    -> DROPPED       (not a 0G field)
 *
 * SELECTION — fully deterministic, no randomness. Walking the source file in
 * its original line order, a record is a candidate if:
 *   A. category is "closed_qa" or "summarization" AND context is non-empty
 *      (these exercise the non-empty `input` path), or
 *   B. category is "open_qa" or "general_qa" AND context is empty
 *      (these exercise the valid-but-empty `input` path)
 * plus, in both cases, instruction and response are non-empty and the combined
 * character length is <= MAX_CHARS (long records inflate the token count, and
 * 0G bills per token).
 *
 * The first N_WITH_CONTEXT group-A records and the first N_EMPTY_CONTEXT
 * group-B records are taken, then interleaved in source-line order. The first
 * TRAIN_SIZE go to train.jsonl and the remainder to test.jsonl.
 *
 * The exact source line numbers taken are written to slice-manifest.json
 * alongside the SHA-256 of the source file, so the selection is reproducible
 * and auditable — that is itself a provenance claim.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import process from 'node:process'

const OUT_DIR = new URL('./dolly-slice/', import.meta.url)

const WITH_CONTEXT_CATEGORIES = new Set(['closed_qa', 'summarization'])
const EMPTY_CONTEXT_CATEGORIES = new Set(['open_qa', 'general_qa'])

const N_WITH_CONTEXT = 216
const N_EMPTY_CONTEXT = 24
const TRAIN_SIZE = 200
const MAX_CHARS = 6000 // keeps the token bill sane; still allows multi-paragraph context

// --- args -------------------------------------------------------------------
const argv = process.argv.slice(2)
const sourceIdx = argv.indexOf('--source')
const sourcePath =
  sourceIdx !== -1 && argv[sourceIdx + 1] ? argv[sourceIdx + 1] : './databricks-dolly-15k.jsonl'

let raw
try {
  raw = readFileSync(sourcePath)
} catch (e) {
  console.error(`Cannot read source dataset at ${sourcePath}\n${e.message}\n`)
  console.error('Download it first:')
  console.error(
    '  curl -sL -o databricks-dolly-15k.jsonl \\\n' +
      '    https://huggingface.co/datasets/databricks/databricks-dolly-15k/resolve/main/databricks-dolly-15k.jsonl',
  )
  process.exit(2)
}

const sourceSha256 = createHash('sha256').update(raw).digest('hex')
const lines = raw.toString('utf8').split('\n')

// --- select -----------------------------------------------------------------
const withContext = []
const emptyContext = []

for (const [i, line] of lines.entries()) {
  if (line.trim() === '') continue
  let rec
  try {
    rec = JSON.parse(line)
  } catch {
    continue
  }

  const instruction = typeof rec.instruction === 'string' ? rec.instruction.trim() : ''
  const context = typeof rec.context === 'string' ? rec.context.trim() : ''
  const response = typeof rec.response === 'string' ? rec.response.trim() : ''
  const category = rec.category

  if (!instruction || !response) continue
  if (instruction.length + context.length + response.length > MAX_CHARS) continue

  const entry = {
    sourceLine: i + 1, // 1-based line number in databricks-dolly-15k.jsonl
    category,
    // The emitted record contains ONLY the three 0G instruction fields.
    record: { instruction, input: context, output: response },
  }

  if (WITH_CONTEXT_CATEGORIES.has(category) && context !== '') {
    if (withContext.length < N_WITH_CONTEXT) withContext.push(entry)
  } else if (EMPTY_CONTEXT_CATEGORIES.has(category) && context === '') {
    if (emptyContext.length < N_EMPTY_CONTEXT) emptyContext.push(entry)
  }

  if (withContext.length === N_WITH_CONTEXT && emptyContext.length === N_EMPTY_CONTEXT) break
}

if (withContext.length < N_WITH_CONTEXT || emptyContext.length < N_EMPTY_CONTEXT) {
  console.error(
    `Source exhausted before filling the slice: ` +
      `${withContext.length}/${N_WITH_CONTEXT} with context, ` +
      `${emptyContext.length}/${N_EMPTY_CONTEXT} empty context.`,
  )
  process.exit(1)
}

// Interleave by restoring source-line order, so the two groups are mixed
// throughout rather than the empty-input records all landing in the test split.
const selected = [...withContext, ...emptyContext].sort((a, b) => a.sourceLine - b.sourceLine)

const train = selected.slice(0, TRAIN_SIZE)
const test = selected.slice(TRAIN_SIZE)

// --- emit -------------------------------------------------------------------
const toJsonl = (entries) => entries.map((e) => JSON.stringify(e.record)).join('\n') + '\n'

writeFileSync(new URL('train.jsonl', OUT_DIR), toJsonl(train), 'utf8')
writeFileSync(new URL('test.jsonl', OUT_DIR), toJsonl(test), 'utf8')

const manifest = {
  source: {
    dataset: 'databricks/databricks-dolly-15k',
    url: 'https://huggingface.co/datasets/databricks/databricks-dolly-15k/resolve/main/databricks-dolly-15k.jsonl',
    licence: 'Apache-2.0',
    attribution: 'Databricks, Inc. — databricks-dolly-15k, human-authored instruction records.',
    sha256: sourceSha256,
    totalLines: lines.filter((l) => l.trim() !== '').length,
    retrieved: '2026-08-14',
  },
  fieldMapping: { instruction: 'instruction', context: 'input', response: 'output', category: '(dropped)' },
  selection: {
    deterministic: true,
    withContextCategories: [...WITH_CONTEXT_CATEGORIES],
    emptyContextCategories: [...EMPTY_CONTEXT_CATEGORIES],
    nWithContext: N_WITH_CONTEXT,
    nEmptyContext: N_EMPTY_CONTEXT,
    maxChars: MAX_CHARS,
    trainSize: TRAIN_SIZE,
    testSize: selected.length - TRAIN_SIZE,
    rule: 'first N matching records in source-line order; no randomness',
  },
  sourceLines: {
    train: train.map((e) => e.sourceLine),
    test: test.map((e) => e.sourceLine),
  },
}

writeFileSync(new URL('slice-manifest.json', OUT_DIR), JSON.stringify(manifest, null, 2) + '\n', 'utf8')

const emptyInputs = selected.filter((e) => e.record.input === '').length
console.log(`source sha256   ${sourceSha256}`)
console.log(`source records  ${manifest.source.totalLines}`)
console.log(`selected        ${selected.length}  (train ${train.length}, test ${test.length})`)
console.log(`empty input     ${emptyInputs}`)
console.log(`wrote train.jsonl, test.jsonl, slice-manifest.json`)
