#!/usr/bin/env node
/**
 * Independent dataset verifier.
 *
 * Deliberately a SECOND, separate implementation of 0G's dataset rules — it does
 * not import @crucible/core. Two independent implementations agreeing is real
 * evidence; one implementation checking itself is not.
 *
 * It also checks things a record-level validator structurally cannot see, because
 * they live in the raw bytes rather than the parsed objects:
 *   - UTF-8 BOM
 *   - CRLF line endings
 *   - blank lines between records
 *   - lines that are individually unparseable
 *   - a JSON array masquerading as JSONL
 *
 * Usage:
 *   node tools/verify-datasets.mjs                 # verify every .jsonl under datasets/
 *   node tools/verify-datasets.mjs path/to/f.jsonl # verify one file
 *   node tools/verify-datasets.mjs --expect-invalid datasets/edge-cases/invalid
 *
 * Exit code 0 = all expectations met, 1 = otherwise. Safe for CI.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'

const MINIMUM_EXAMPLES = 10

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
}

const isStr = (v) => typeof v === 'string'
const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Which of 0G's three formats does this record match, if any? */
function detectFormat(record) {
  if (!isObj(record)) return null
  const { messages, instruction, input, output, text } = record

  if (
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.every((m) => isObj(m) && isStr(m.role) && isStr(m.content))
  ) {
    return 'chat'
  }
  if (isStr(instruction) && isStr(output) && (input === undefined || isStr(input))) {
    return 'instruction'
  }
  if (isStr(text)) return 'text'
  return null
}

/** Rough token estimate. Not the broker's count — that is authoritative. */
function estimateTokens(record) {
  let chars = 0
  const walk = (v) => {
    if (isStr(v)) chars += v.length
    else if (Array.isArray(v)) v.forEach(walk)
    else if (isObj(v)) Object.values(v).forEach(walk)
  }
  walk(record)
  return Math.ceil(chars / 4)
}

function verifyFile(path) {
  const errors = []
  const warnings = []
  const raw = readFileSync(path)

  // ── byte-level checks a parsed-record validator cannot make ──────────────
  if (raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
    errors.push('File starts with a UTF-8 BOM. 0G requires clean UTF-8; strip it.')
  }

  const content = raw.toString('utf8').replace(/^﻿/, '')

  if (content.includes('\r\n')) {
    errors.push('File uses CRLF line endings. Use LF (\\n) only.')
  }
  if (content.length === 0) {
    return { path, errors: ['File is empty.'], warnings, records: 0, format: null, tokens: 0 }
  }
  if (!content.endsWith('\n')) {
    warnings.push('File does not end with a newline.')
  }

  const trimmedStart = content.trimStart()
  if (trimmedStart.startsWith('[')) {
    errors.push('File looks like a JSON array. JSONL requires one JSON object per line.')
  }

  // ── line-level checks ───────────────────────────────────────────────────
  const lines = content.split('\n')
  // A single trailing newline is correct and produces one empty final element.
  if (lines[lines.length - 1] === '') lines.pop()

  const records = []
  const counts = new Map()
  const unparseable = []
  const unrecognised = []
  let tokens = 0

  for (const [i, line] of lines.entries()) {
    const lineNo = i + 1

    if (line.trim() === '') {
      errors.push(`Line ${lineNo} is blank. 0G rejects blank lines between records.`)
      continue
    }
    if (/,\s*$/.test(line)) {
      errors.push(`Line ${lineNo} ends with a comma. Each line must be a standalone JSON object.`)
      continue
    }

    let record
    try {
      record = JSON.parse(line)
    } catch (e) {
      unparseable.push(lineNo)
      continue
    }

    const format = detectFormat(record)
    if (format === null) {
      unrecognised.push(lineNo)
      continue
    }

    counts.set(format, (counts.get(format) ?? 0) + 1)
    records.push(record)
    tokens += estimateTokens(record)
  }

  const cap = (list, render) => {
    for (const n of list.slice(0, 5)) errors.push(render(n))
    if (list.length > 5) errors.push(`…and ${list.length - 5} more like it.`)
  }

  cap(unparseable, (n) => `Line ${n} is not valid JSON.`)
  cap(
    unrecognised,
    (n) => `Line ${n} matches none of 0G's three formats (chat, instruction, text).`,
  )

  if (counts.size > 1) {
    const summary = [...counts.entries()].map(([f, n]) => `${f} (${n})`).join(', ')
    errors.push(`File mixes formats: ${summary}. 0G requires one format throughout.`)
  }

  const total = lines.length
  if (total < MINIMUM_EXAMPLES) {
    errors.push(`File has ${total} lines. 0G requires at least ${MINIMUM_EXAMPLES} examples.`)
  }

  const format = counts.size === 1 ? [...counts.keys()][0] : null
  return { path, errors, warnings, records: records.length, format, tokens }
}

function collect(target) {
  const st = statSync(target)
  if (st.isFile()) return [target]

  const found = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (extname(full) === '.jsonl') found.push(full)
    }
  }
  walk(target)
  return found.sort()
}

// ── main ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const expectInvalid = argv.includes('--expect-invalid')
const targets = argv.filter((a) => !a.startsWith('--'))
const roots = targets.length > 0 ? targets : ['datasets']

let files = []
for (const root of roots) {
  try {
    files.push(...collect(root))
  } catch {
    console.error(C.red(`Cannot read "${root}" — does it exist yet?`))
    process.exit(1)
  }
}

if (files.length === 0) {
  console.error(C.yellow(`No .jsonl files found under ${roots.join(', ')}.`))
  process.exit(1)
}

console.log()
console.log(
  C.bold('  DATASET VERIFICATION') +
    C.dim(`  ·  independent of @crucible/core  ·  ${files.length} file(s)`),
)
console.log(
  C.dim(`  ${'─'.repeat(72)}`) +
    (expectInvalid ? C.yellow('\n  mode: --expect-invalid (every file MUST fail)') : ''),
)

let unmet = 0
let totalRecords = 0
let totalTokens = 0

for (const file of files) {
  const r = verifyFile(file)
  const rel = relative(process.cwd(), file)
  const failed = r.errors.length > 0
  const met = expectInvalid ? failed : !failed

  if (!met) unmet++
  if (!expectInvalid && !failed) {
    totalRecords += r.records
    totalTokens += r.tokens
  }

  const mark = met ? C.green('✓') : C.red('✗')
  const verdict = failed ? C.red('INVALID') : C.green('VALID')
  console.log()
  console.log(`  ${mark} ${rel}  ${verdict}`)

  if (!failed) {
    console.log(
      C.dim(`     ${r.records} records · format "${r.format}" · ~${r.tokens.toLocaleString()} tokens`),
    )
  }
  for (const e of r.errors) console.log(C.dim('     ') + C.red(e))
  for (const w of r.warnings) console.log(C.dim('     ') + C.yellow(w))

  if (expectInvalid && !failed) {
    console.log(C.dim('     ') + C.red('Expected this file to be rejected, but it passed.'))
  }
}

console.log()
console.log(C.dim(`  ${'─'.repeat(72)}`))

if (!expectInvalid && totalRecords > 0) {
  // testnet 0.8 0G / 1M tokens, mainnet 0.5, plus 0.01 storage reserve for the 0.5B model
  const cost = (rate, epochs) => ((totalTokens / 1e6) * rate * epochs + 0.01).toFixed(4)
  console.log(
    C.dim(
      `  ${totalRecords} valid records · ~${totalTokens.toLocaleString()} tokens · ` +
        `3-epoch cost ≈ ${cost(0.8, 3)} 0G testnet / ${cost(0.5, 3)} 0G mainnet`,
    ),
  )
}

console.log(
  unmet === 0
    ? `  ${C.green('✓')} ${C.bold('all expectations met')}`
    : `  ${C.red('✗')} ${unmet} file(s) did not meet expectations`,
)
console.log()

process.exit(unmet === 0 ? 1 && 0 || 0 : 1)
