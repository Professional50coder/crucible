#!/usr/bin/env node
/**
 * 0G fine-tuning dataset validator — zero dependencies.
 *
 *   node datasets/validate.mjs <file.jsonl> [more.jsonl ...]
 *   node datasets/validate.mjs --expect-fail datasets/edge-cases/invalid/*.jsonl
 *
 * Format rules are deliberately identical to `packages/core/src/dataset.ts`
 * (`detectFormat` / `validateDataset` / `MINIMUM_EXAMPLES`). If the two ever
 * disagree, packages/core is the authority and this file is the bug.
 *
 * Rules enforced (0G Compute fine-tuning dataset requirements):
 *   - UTF-8, no byte-order mark
 *   - LF line endings (a CRLF file carries a stray \r into every record)
 *   - one JSON object per line, each parseable in isolation
 *   - no blank lines, no trailing commas
 *   - every record matches exactly one of three formats: chat / instruction / text
 *   - one format used throughout the file — mixing is a hard failure
 *   - at least 10 examples
 */

import { readFileSync } from 'node:fs'
import process from 'node:process'

/** 0G's stated minimum. Real behaviour change needs 200-1,000 for Qwen2.5-0.5B. */
const MINIMUM_EXAMPLES = 10

/** Cap on per-line errors before summarising, so a wholly broken file stays readable. */
const MAX_REPORTED_LINES = 5

/** Rough chars-per-token for Qwen2.5. Only an estimate — see estimateTokens(). */
const CHARS_PER_TOKEN = 4

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
const isString = (v) => typeof v === 'string'

// ---------------------------------------------------------------------------
// Format detection — mirrors packages/core/src/dataset.ts exactly.
// ---------------------------------------------------------------------------

export function detectFormat(record) {
  if (!isObject(record)) return null

  const { messages, instruction, input, output, text } = record

  if (
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.every((m) => isObject(m) && isString(m.role) && isString(m.content))
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

// ---------------------------------------------------------------------------
// Why a record was rejected. detectFormat only answers yes/no; the demo needs
// a reason a human can act on, so we re-walk the record to name the fault.
// ---------------------------------------------------------------------------

function explainRejection(record) {
  if (Array.isArray(record)) {
    return 'line is a JSON array, not a JSON object — JSONL requires one object per line'
  }
  if (!isObject(record)) {
    return `line parsed as ${record === null ? 'null' : typeof record}, not a JSON object`
  }

  if ('messages' in record) {
    const { messages } = record
    if (!Array.isArray(messages)) return '"messages" is present but is not an array'
    if (messages.length === 0) return '"messages" is an empty array — chat records need at least one message'
    for (const [i, m] of messages.entries()) {
      if (!isObject(m)) return `messages[${i}] is not an object`
      if (!('role' in m)) return `messages[${i}] has no "role"`
      if (!isString(m.role)) return `messages[${i}].role is ${m.role === null ? 'null' : typeof m.role}, must be a string`
      if (!('content' in m)) return `messages[${i}] has no "content"`
      if (!isString(m.content)) return `messages[${i}].content is ${m.content === null ? 'null' : typeof m.content}, must be a string`
    }
    return '"messages" present but the record still matched no format'
  }

  if ('instruction' in record || 'output' in record || 'input' in record) {
    if (!isString(record.instruction)) {
      return 'instruction' in record
        ? '"instruction" is present but is not a string'
        : 'instruction record has no "instruction" key'
    }
    if (!('output' in record)) return 'instruction record has no "output" key'
    if (!isString(record.output)) return '"output" is not a string'
    if (record.input !== undefined && !isString(record.input)) return '"input" is present but is not a string'
    return 'instruction-shaped record still matched no format'
  }

  if ('text' in record) return '"text" is present but is not a string'

  return `object has keys [${Object.keys(record).join(', ')}] and matches none of 0G's three formats (chat / instruction / text)`
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Sums the natural-language payload of each record (message contents, or the
 * instruction/input/output text, or the text field) and divides by a
 * chars-per-token constant.
 *
 * This is an ESTIMATE for cost planning only. The authoritative number comes
 * from the real Qwen tokenizer via `broker.fineTuning.calculateToken()`.
 */
function estimateTokens(records) {
  let chars = 0
  for (const r of records) {
    if (!isObject(r)) continue
    if (Array.isArray(r.messages)) {
      for (const m of r.messages) {
        if (isObject(m) && isString(m.content)) chars += m.content.length + 8 // ~8 for role/turn markers
      }
    } else if (isString(r.text)) {
      chars += r.text.length
    } else {
      for (const k of ['instruction', 'input', 'output']) {
        if (isString(r[k])) chars += r[k].length
      }
    }
  }
  return Math.ceil(chars / CHARS_PER_TOKEN)
}

// ---------------------------------------------------------------------------
// Cost estimation (documented in datasets/README.md)
//   cost = tokens / 1e6 * pricePerMillion * epochs  +  storage reserve
// ---------------------------------------------------------------------------

const PRICE_PER_MILLION = { testnet: 0.8, mainnet: 0.5 } // 0G, from FIELD_NOTES.md
const STORAGE_RESERVE = 0.01 // 0G, Qwen2.5-0.5B-Instruct
const EPOCHS = 3 // fine-tuning-example/config/training_config.json

function estimateCost(tokens, network) {
  return (tokens / 1e6) * PRICE_PER_MILLION[network] * EPOCHS + STORAGE_RESERVE
}

// ---------------------------------------------------------------------------
// File-level validation
// ---------------------------------------------------------------------------

function validateFile(path) {
  const errors = []
  const warnings = []

  let buf
  try {
    buf = readFileSync(path)
  } catch (e) {
    return { path, errors: [`cannot read file: ${e.message}`], warnings, records: [], tokens: 0 }
  }

  if (buf.length === 0) {
    return { path, errors: ['file is empty'], warnings, records: [], tokens: 0 }
  }

  // --- byte-order mark -----------------------------------------------------
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    errors.push(
      'file starts with a UTF-8 byte-order mark (EF BB BF). 0G expects plain UTF-8; ' +
        'the BOM becomes part of the first line and breaks JSON.parse on line 1.',
    )
  }

  // --- strict UTF-8 --------------------------------------------------------
  let content
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return {
      path,
      errors: [...errors, 'file is not valid UTF-8 (contains malformed byte sequences)'],
      warnings,
      records: [],
      tokens: 0,
    }
  }

  // --- line endings --------------------------------------------------------
  const crlfCount = (content.match(/\r\n/g) ?? []).length
  const loneCr = (content.match(/\r(?!\n)/g) ?? []).length
  if (crlfCount > 0) {
    errors.push(
      `file uses CRLF line endings (${crlfCount} occurrence${crlfCount === 1 ? '' : 's'}). ` +
        '0G expects LF-delimited JSONL; a trailing \\r is carried into every record.',
    )
  }
  if (loneCr > 0) {
    errors.push(`file contains ${loneCr} bare carriage return(s) outside a CRLF pair.`)
  }

  // --- extension -----------------------------------------------------------
  if (!path.toLowerCase().endsWith('.jsonl')) {
    warnings.push('file does not have a .jsonl extension; 0G expects .jsonl')
  }

  // --- lines ---------------------------------------------------------------
  // Normalise for parsing so we report ONE line-ending error, not one per line.
  const normalised = content.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  const rawLines = normalised.split('\n')

  // A single trailing newline is correct JSONL and is not a blank line.
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') rawLines.pop()
  else warnings.push('file does not end with a newline')

  const records = []
  const blankLines = []
  const parseErrors = []
  const unrecognised = []
  const formatCounts = new Map()
  const firstLineOf = new Map()

  for (const [i, line] of rawLines.entries()) {
    const lineNo = i + 1

    if (line.trim() === '') {
      blankLines.push(lineNo)
      continue
    }

    let parsed
    try {
      parsed = JSON.parse(line)
    } catch (e) {
      // Name the two failure modes the 0G rules call out explicitly.
      let hint = ''
      if (/,\s*[}\]]/.test(line)) hint = ' (looks like a trailing comma)'
      else if (line.trimStart().startsWith('[')) hint = ' (looks like a JSON array — JSONL needs one object per line)'
      parseErrors.push({ lineNo, message: `${e.message}${hint}` })
      continue
    }

    const format = detectFormat(parsed)
    if (format === null) {
      unrecognised.push({ lineNo, reason: explainRejection(parsed) })
      continue
    }

    formatCounts.set(format, (formatCounts.get(format) ?? 0) + 1)
    if (!firstLineOf.has(format)) firstLineOf.set(format, lineNo)
    records.push(parsed)
  }

  // --- assemble errors -----------------------------------------------------
  for (const lineNo of blankLines.slice(0, MAX_REPORTED_LINES)) {
    errors.push(`Line ${lineNo}: blank line. 0G rejects blank lines between records.`)
  }
  if (blankLines.length > MAX_REPORTED_LINES) {
    errors.push(`...and ${blankLines.length - MAX_REPORTED_LINES} more blank line(s).`)
  }

  for (const { lineNo, message } of parseErrors.slice(0, MAX_REPORTED_LINES)) {
    errors.push(`Line ${lineNo}: not valid JSON — ${message}`)
  }
  if (parseErrors.length > MAX_REPORTED_LINES) {
    errors.push(`...and ${parseErrors.length - MAX_REPORTED_LINES} more unparseable line(s).`)
  }

  for (const { lineNo, reason } of unrecognised.slice(0, MAX_REPORTED_LINES)) {
    errors.push(`Line ${lineNo}: matches none of 0G's three formats — ${reason}.`)
  }
  if (unrecognised.length > MAX_REPORTED_LINES) {
    errors.push(`...and ${unrecognised.length - MAX_REPORTED_LINES} more unrecognised line(s).`)
  }

  if (formatCounts.size > 1) {
    const ranked = [...formatCounts.entries()].sort((a, b) => b[1] - a[1])
    const summary = ranked.map(([f, n]) => `${f} (${n} record${n === 1 ? '' : 's'})`).join(', ')
    const minorityFormat = ranked[ranked.length - 1][0]
    errors.push(
      `Dataset mixes formats: ${summary}. 0G requires one format throughout — ` +
        `line ${firstLineOf.get(minorityFormat)} is the first "${minorityFormat}" record.`,
    )
  }

  const total = records.length + parseErrors.length + unrecognised.length
  if (total < MINIMUM_EXAMPLES) {
    errors.push(`Dataset has ${total} examples. 0G requires at least ${MINIMUM_EXAMPLES}.`)
  }

  return {
    path,
    errors,
    warnings,
    records,
    formatCounts,
    tokens: estimateTokens(records),
  }
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function report(result) {
  const { path, errors, warnings, records, formatCounts, tokens } = result
  const ok = errors.length === 0

  console.log('='.repeat(72))
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${path}`)
  console.log('='.repeat(72))

  if (records.length > 0) {
    const fmt = formatCounts && formatCounts.size === 1 ? [...formatCounts.keys()][0] : 'mixed'
    console.log(`  format            ${fmt}`)
    console.log(`  valid records     ${records.length}`)
    console.log(`  estimated tokens  ${tokens.toLocaleString('en-US')}  (~${CHARS_PER_TOKEN} chars/token)`)
    console.log(
      `  est. cost @3ep    testnet ${estimateCost(tokens, 'testnet').toFixed(4)} 0G  ` +
        `|  mainnet ${estimateCost(tokens, 'mainnet').toFixed(4)} 0G  (incl. ${STORAGE_RESERVE} 0G storage reserve)`,
    )
  }

  for (const w of warnings) console.log(`  WARN  ${w}`)

  if (ok) {
    console.log('  OK  no errors. Dataset satisfies every 0G requirement checked here.')
  } else {
    console.log(`  ${errors.length} error(s):`)
    for (const e of errors) console.log(`   x ${e}`)
  }
  console.log('')
  return ok
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

// Only run the CLI when invoked directly, so the format helpers above can be
// imported by tests (and cross-checked against packages/core) without side effects.
const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href

if (!invokedDirectly) {
  // imported as a module — export only
} else {
  runCli()
}

function runCli() {
const args = process.argv.slice(2)
const expectFail = args.includes('--expect-fail')
const files = args.filter((a) => !a.startsWith('--'))

if (files.length === 0) {
  console.error('usage: node datasets/validate.mjs <file.jsonl> [more.jsonl ...] [--expect-fail]')
  process.exit(2)
}

let allAsExpected = true
for (const file of files) {
  const result = validateFile(file)
  const passed = report(result)
  if (expectFail ? passed : !passed) allAsExpected = false
}

if (expectFail) {
  console.log(
    allAsExpected
      ? `ALL ${files.length} FILE(S) CORRECTLY REJECTED.`
      : 'ONE OR MORE FILES WERE EXPECTED TO FAIL BUT PASSED.',
  )
} else if (files.length > 1) {
  console.log(allAsExpected ? `ALL ${files.length} FILES PASS.` : 'ONE OR MORE FILES FAILED.')
}

process.exit(allAsExpected ? 0 : 1)
}
