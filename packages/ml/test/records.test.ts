import { describe, expect, it } from 'vitest'

import { detectFormat, estimateTokens, normaliseRecords } from '../src/analyze/records.js'

describe('detectFormat', () => {
  it('detects the chat format', () => {
    expect(
      detectFormat({
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
        ],
      }),
    ).toBe('chat')
  })

  it('detects the instruction format, with or without input', () => {
    expect(detectFormat({ instruction: 'Translate', input: 'cat', output: 'chat' })).toBe(
      'instruction',
    )
    expect(detectFormat({ instruction: 'Say hi', output: 'hi' })).toBe('instruction')
    expect(detectFormat({ instruction: 'Say hi', input: '', output: 'hi' })).toBe('instruction')
  })

  it('detects the text format', () => {
    expect(detectFormat({ text: 'once upon a time' })).toBe('text')
  })

  it('returns null for anything else', () => {
    expect(detectFormat({ foo: 'bar' })).toBeNull()
    expect(detectFormat(null)).toBeNull()
    expect(detectFormat('a string')).toBeNull()
    expect(detectFormat([{ role: 'user', content: 'hi' }])).toBeNull()
    expect(detectFormat({ messages: [] })).toBeNull()
  })
})

describe('normaliseRecords', () => {
  it('numbers lines from 1, matching JSONL line numbers', () => {
    const rows = normaliseRecords([{ text: 'a' }, { text: 'b' }])
    expect(rows.map((r) => r.line)).toEqual([1, 2])
  })

  it('splits a chat record into prompt side and assistant answer', () => {
    const [row] = normaliseRecords([
      {
        messages: [
          { role: 'system', content: 'Be terse.' },
          { role: 'user', content: 'Capital of France?' },
          { role: 'assistant', content: 'Paris' },
        ],
      },
    ])

    expect(row!.format).toBe('chat')
    expect(row!.input).toContain('Capital of France?')
    expect(row!.input).toContain('Be terse.')
    expect(row!.output).toBe('Paris')
  })

  it('uses the LAST assistant turn as the output in a multi-turn chat', () => {
    const [row] = normaliseRecords([
      {
        messages: [
          { role: 'user', content: 'q1' },
          { role: 'assistant', content: 'a1' },
          { role: 'user', content: 'q2' },
          { role: 'assistant', content: 'a2' },
        ],
      },
    ])
    expect(row!.output).toBe('a2')
  })

  it('joins instruction and input on the prompt side', () => {
    const [row] = normaliseRecords([
      { instruction: 'Translate to French', input: 'cat', output: 'chat' },
    ])

    expect(row!.format).toBe('instruction')
    expect(row!.input).toContain('Translate to French')
    expect(row!.input).toContain('cat')
    expect(row!.output).toBe('chat')
  })

  it('treats a text record as having no separate prompt or answer', () => {
    const [row] = normaliseRecords([{ text: 'a long passage' }])
    expect(row!.format).toBe('text')
    expect(row!.input).toBe('')
    expect(row!.output).toBe('')
    expect(row!.full).toBe('a long passage')
  })

  it('exposes a `full` field containing everything, for dedup', () => {
    const [row] = normaliseRecords([{ instruction: 'A', input: 'B', output: 'C' }])
    expect(row!.full).toContain('A')
    expect(row!.full).toContain('B')
    expect(row!.full).toContain('C')
  })

  it('uses `full` as the comparison key when there is no prompt side', () => {
    const [chat] = normaliseRecords([
      { messages: [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a' }] },
    ])
    const [text] = normaliseRecords([{ text: 'passage' }])

    expect(chat!.key).toBe(chat!.input)
    expect(text!.key).toBe(text!.full)
  })

  it('survives an unrecognised record instead of throwing', () => {
    const rows = normaliseRecords([{ nonsense: true }])
    expect(rows[0]!.format).toBeNull()
    expect(typeof rows[0]!.full).toBe('string')
  })

  it('does not crash on null or non-object records', () => {
    const rows = normaliseRecords([null, 42, 'text'])
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.format === null)).toBe(true)
  })
})

describe('estimateTokens', () => {
  it('is roughly one token per four characters', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100)
  })

  it('rounds up so a short string is never zero tokens', () => {
    expect(estimateTokens('hi')).toBe(1)
  })

  it('is zero for an empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('grows monotonically with length', () => {
    expect(estimateTokens('a'.repeat(100))).toBeLessThan(estimateTokens('a'.repeat(200)))
  })
})
