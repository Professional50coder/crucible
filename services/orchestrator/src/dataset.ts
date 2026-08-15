import { readFileSync } from 'node:fs'

/**
 * Just enough dataset introspection to fill the job page's Dataset panel.
 *
 * `detectFormat` mirrors `@crucible/core`'s rules exactly (see that module for
 * the format documentation). VALIDATION is emphatically core's job — this is a
 * read-only summariser for display, and it never rejects anything or blocks a
 * submission. A caller that has already run core's validator can pass the
 * authoritative numbers on `POST /jobs` instead, and they win.
 */

export type DatasetFormat = 'chat' | 'instruction' | 'text'

export interface DatasetSummary {
  format: DatasetFormat
  exampleCount: number
  /**
   * ESTIMATE ONLY. 0G counts tokens itself with its own tokenizer; this is a
   * ~4-characters-per-token approximation so the UI can show a number and a
   * cost before funds move. Never treat it as authoritative.
   */
  tokenCount: number
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isString = (v: unknown): v is string => typeof v === 'string'

/** Mirrors `@crucible/core`'s `detectFormat`. */
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

/** ~4 characters per token, the usual rough rule for this model family. */
export function estimateTokenCount(records: unknown[]): number {
  let characters = 0
  for (const record of records) {
    characters += JSON.stringify(record)?.length ?? 0
  }
  return Math.max(1, Math.ceil(characters / 4))
}

/**
 * Summarise a JSONL dataset on disk. Returns `undefined` if the file cannot be
 * read or contains no recognisable records — a missing summary must never stop
 * a job from being submitted.
 */
export function analyzeDatasetFile(path: string): DatasetSummary | undefined {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return undefined
  }

  const records: unknown[] = []
  const counts = new Map<DatasetFormat, number>()

  for (const line of raw.replace(/^﻿/, '').split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      continue
    }
    records.push(parsed)
    const format = detectFormat(parsed)
    if (format) counts.set(format, (counts.get(format) ?? 0) + 1)
  }

  if (counts.size === 0) return undefined

  // Mixed files are core's problem to flag; for display we show the majority.
  const [format] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!

  return {
    format,
    exampleCount: records.length,
    tokenCount: estimateTokenCount(records),
  }
}
