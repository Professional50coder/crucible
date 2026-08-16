import { describe, expect, test } from 'vitest'
import {
  CHARS_PER_TOKEN,
  approximateTokenCount,
  approximateTokenCountForJsonl,
  parseJsonlLoosely,
} from '../src/tokens.js'

/**
 * The point of these tests is not that 4 is the right divisor — it is not, it is
 * a rule of thumb. It is that this module answers exactly what the orchestrator
 * answers (services/orchestrator/src/dataset.ts:56), because the two now quote
 * the same user the same number for the same file.
 */
const orchestrator = (records: unknown[]): number => {
  let characters = 0
  for (const record of records) characters += JSON.stringify(record)?.length ?? 0
  return Math.max(1, Math.ceil(characters / 4))
}

describe('approximateTokenCount', () => {
  test('divides the serialised JSON by the chars-per-token constant', () => {
    expect(CHARS_PER_TOKEN).toBe(4)
    // {"text":"aaaa"} — 16 characters of JSON, not the 4 characters of payload.
    expect(approximateTokenCount([{ text: 'aaaa' }])).toBe(4)
  })

  test('agrees with the orchestrator on every 0G dataset format', () => {
    const chat = { messages: [{ role: 'user', content: 'Hello there' }] }
    const instruction = { instruction: 'Summarise this', input: 'a paragraph', output: 'short' }
    const text = { text: 'a completion-format line' }

    for (const record of [chat, instruction, text]) {
      expect(approximateTokenCount([record])).toBe(orchestrator([record]))
    }
    expect(approximateTokenCount([chat, instruction, text])).toBe(
      orchestrator([chat, instruction, text]),
    )
  })

  test('counts the JSON envelope, which is why chat records read high', () => {
    // The 2.3x overstatement packages/ml/README.md records comes from here: the
    // role/content scaffolding is most of a short chat record's characters.
    const chat = { messages: [{ role: 'user', content: 'hi' }] }
    const payload = 'hi'.length
    expect(approximateTokenCount([chat])).toBeGreaterThan(Math.ceil(payload / CHARS_PER_TOKEN))
  })

  test('reports zero for no records rather than the orchestrator floor of one', () => {
    // The one deliberate divergence. 0G rejects a dataset under 10 examples, so
    // no priced run can reach this input; "1 token" for an empty file is noise.
    expect(approximateTokenCount([])).toBe(0)
    expect(orchestrator([])).toBe(1)
  })

  test('never rounds a non-empty dataset down to zero tokens', () => {
    expect(approximateTokenCount([1])).toBe(1)
  })

  test('skips values JSON cannot serialise instead of counting NaN characters', () => {
    expect(approximateTokenCount([undefined, { text: 'aaaa' }])).toBe(4)
  })

  test('grows with the dataset', () => {
    expect(approximateTokenCount([{ text: 'a'.repeat(400) }])).toBeGreaterThan(
      approximateTokenCount([{ text: 'a'.repeat(100) }]),
    )
  })
})

describe('parseJsonlLoosely', () => {
  test('skips blank and unparseable lines rather than throwing', () => {
    expect(parseJsonlLoosely('{"a":1}\n\nnot json\n{"b":2}\n')).toEqual([{ a: 1 }, { b: 2 }])
  })

  test('tolerates a BOM, which validateDatasetFile is the one to report', () => {
    expect(parseJsonlLoosely('﻿{"a":1}\n')).toEqual([{ a: 1 }])
  })

  test('tolerates CRLF line endings', () => {
    expect(parseJsonlLoosely('{"a":1}\r\n{"b":2}\r\n')).toEqual([{ a: 1 }, { b: 2 }])
  })

  test('returns nothing for an empty file', () => {
    expect(parseJsonlLoosely('')).toEqual([])
  })
})

describe('approximateTokenCountForJsonl', () => {
  test('is the two steps composed', () => {
    const jsonl = '{"text":"aaaa"}\nbroken\n{"text":"bbbb"}\n'
    expect(approximateTokenCountForJsonl(jsonl)).toBe(approximateTokenCount(parseJsonlLoosely(jsonl)))
    expect(approximateTokenCountForJsonl(jsonl)).toBe(8)
  })

  test('an unreadable file is zero tokens, not a crash', () => {
    expect(approximateTokenCountForJsonl('not json at all')).toBe(0)
  })
})
