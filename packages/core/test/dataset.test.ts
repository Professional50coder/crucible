import { describe, expect, test } from 'vitest'
import { detectFormat, validateDataset, recordsToJsonl } from '../src/dataset.js'

const chat = [
  { messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }] },
]
const instruction = [{ instruction: 'Translate', input: 'Hello', output: 'Bonjour' }]
const text = [{ text: 'The quick brown fox.' }]

const repeat = <T,>(record: T, n: number): T[] => Array.from({ length: n }, () => record)

describe('detectFormat', () => {
  test('detects the chat-messages format', () => {
    expect(detectFormat(chat[0]!)).toBe('chat')
  })

  test('detects the instruction format', () => {
    expect(detectFormat(instruction[0]!)).toBe('instruction')
  })

  test('detects the text-completion format', () => {
    expect(detectFormat(text[0]!)).toBe('text')
  })

  test('returns null for a record matching no 0G format', () => {
    expect(detectFormat({ prompt: 'x', completion: 'y' })).toBeNull()
  })
})

describe('validateDataset', () => {
  test('accepts 10 consistent chat records', () => {
    expect(validateDataset(repeat(chat[0]!, 10))).toEqual([])
  })

  test('rejects a dataset with fewer than 10 examples', () => {
    expect(validateDataset(repeat(chat[0]!, 9))).toEqual([
      'Dataset has 9 examples. 0G requires at least 10.',
    ])
  })

  test('rejects a dataset that mixes two formats', () => {
    const mixed = [...repeat(chat[0]!, 9), instruction[0]!]

    expect(validateDataset(mixed)).toEqual([
      'Dataset mixes formats: chat (9 records), instruction (1 record). 0G requires one format throughout — line 10 is the first "instruction" record.',
    ])
  })

  test('rejects a record matching no known format, naming the line', () => {
    const bad = [...repeat(chat[0]!, 9), { prompt: 'x' }]

    expect(validateDataset(bad)).toEqual([
      'Line 10 matches none of 0G\'s three formats (chat messages, instruction, text).',
    ])
  })

  test('rejects an instruction record missing its output field', () => {
    const bad = [...repeat(chat[0]!, 9), { instruction: 'Do a thing', input: '' }]

    expect(validateDataset(bad)).toEqual([
      'Line 10 matches none of 0G\'s three formats (chat messages, instruction, text).',
    ])
  })

  test('caps unrecognised-line errors at 5 and summarises the rest', () => {
    const bad = repeat({ prompt: 'x' } as never, 12)
    const errors = validateDataset(bad)

    expect(errors).toEqual([
      'Line 1 matches none of 0G\'s three formats (chat messages, instruction, text).',
      'Line 2 matches none of 0G\'s three formats (chat messages, instruction, text).',
      'Line 3 matches none of 0G\'s three formats (chat messages, instruction, text).',
      'Line 4 matches none of 0G\'s three formats (chat messages, instruction, text).',
      'Line 5 matches none of 0G\'s three formats (chat messages, instruction, text).',
      '…and 7 more unrecognised lines (12 of 12 records match no 0G format).',
    ])
  })

  test('accepts an instruction record with an empty input', () => {
    const ok = repeat({ instruction: 'Write a haiku', input: '', output: 'Bugs...' }, 10)

    expect(validateDataset(ok)).toEqual([])
  })
})

describe('recordsToJsonl', () => {
  test('emits one compact JSON object per line with a trailing newline', () => {
    expect(recordsToJsonl(text)).toBe('{"text":"The quick brown fox."}\n')
  })

  test('emits no blank lines between records', () => {
    const jsonl = recordsToJsonl(repeat(text[0]!, 3))

    expect(jsonl.split('\n').filter((l) => l === '')).toHaveLength(1)
  })
})
