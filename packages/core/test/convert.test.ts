import { describe, expect, it } from 'vitest'
import { convertDataset } from '../src/convert.js'
import { detectFormat } from '../src/dataset.js'

/**
 * The property that matters most here is not "does it convert" — it is "does it
 * refuse to convert when converting would lose something". A provenance tool
 * that silently drops a system prompt during a format change would be quietly
 * falsifying the very thing it exists to record.
 */

const instructionRecord = {
  instruction: 'Classify the sentiment.',
  input: 'You are a terse sentiment classifier.',
  output: 'positive',
}

const chatRecord = {
  messages: [
    { role: 'system', content: 'You are a terse sentiment classifier.' },
    { role: 'user', content: 'Classify the sentiment.' },
    { role: 'assistant', content: 'positive' },
  ],
}

const bareInstruction = { instruction: 'Name a colour.', input: '', output: 'blue' }
const bareChat = {
  messages: [
    { role: 'user', content: 'Name a colour.' },
    { role: 'assistant', content: 'blue' },
  ],
}

describe('convertDataset — instruction to chat', () => {
  it('maps input to a system message, instruction to user, output to assistant', () => {
    const result = convertDataset([instructionRecord], 'chat')
    expect(result.skipped).toEqual([])
    expect(result.converted).toBe(1)
    expect(result.records[0]).toEqual(chatRecord)
  })

  it('omits the system message entirely when input is empty', () => {
    const result = convertDataset([bareInstruction], 'chat')
    expect(result.records[0]).toEqual(bareChat)
  })

  it('produces records that detectFormat agrees are chat', () => {
    const result = convertDataset([instructionRecord, bareInstruction], 'chat')
    for (const record of result.records) expect(detectFormat(record)).toBe('chat')
  })
})

describe('convertDataset — chat to instruction', () => {
  it('is the exact inverse of instruction to chat', () => {
    const result = convertDataset([chatRecord], 'instruction')
    expect(result.skipped).toEqual([])
    expect(result.records[0]).toEqual(instructionRecord)
  })

  it('round-trips both directions without loss', () => {
    const toChat = convertDataset([instructionRecord, bareInstruction], 'chat')
    const backAgain = convertDataset(toChat.records, 'instruction')
    expect(backAgain.records).toEqual([instructionRecord, bareInstruction])
    expect(backAgain.skipped).toEqual([])
  })

  it('produces records that detectFormat agrees are instruction', () => {
    const result = convertDataset([chatRecord], 'instruction')
    for (const record of result.records) expect(detectFormat(record)).toBe('instruction')
  })
})

describe('convertDataset — refusing to lose information', () => {
  it('skips a multi-turn conversation rather than truncating it', () => {
    const multiTurn = {
      messages: [
        { role: 'user', content: 'first question' },
        { role: 'assistant', content: 'first answer' },
        { role: 'user', content: 'follow-up' },
        { role: 'assistant', content: 'second answer' },
      ],
    }
    const result = convertDataset([multiTurn], 'instruction')
    expect(result.records).toEqual([])
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0]!.line).toBe(1)
    expect(result.skipped[0]!.from).toBe('chat')
    expect(result.skipped[0]!.reason).toMatch(/lose 2 turn/)
  })

  it('skips a conversation whose roles are the wrong way round', () => {
    const inverted = {
      messages: [
        { role: 'assistant', content: 'answer first' },
        { role: 'user', content: 'question second' },
      ],
    }
    const result = convertDataset([inverted], 'instruction')
    expect(result.records).toEqual([])
    expect(result.skipped[0]!.reason).toMatch(/expected a user message/)
  })

  it('refuses to invent structure when converting from text', () => {
    const result = convertDataset([{ text: 'some continuation text' }], 'instruction')
    expect(result.records).toEqual([])
    expect(result.skipped[0]!.from).toBe('text')
    expect(result.skipped[0]!.reason).toMatch(/inventing it/)
  })

  it('reports an unrecognised record without stopping the rest of the file', () => {
    const result = convertDataset([instructionRecord, { nonsense: true }, bareInstruction], 'chat')
    expect(result.records).toHaveLength(2)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0]!.line).toBe(2)
    expect(result.skipped[0]!.from).toBeNull()
  })

  it('numbers skipped lines from 1, matching every other validator here', () => {
    const result = convertDataset([bareInstruction, { text: 'x' }], 'instruction')
    expect(result.skipped[0]!.line).toBe(2)
  })
})

describe('convertDataset — text as a one-way target', () => {
  it('flags conversion to text as lossy', () => {
    const result = convertDataset([instructionRecord], 'text')
    expect(result.lossy).toBe(true)
    expect(detectFormat(result.records[0])).toBe('text')
  })

  it('does not flag lossy when nothing was actually converted', () => {
    const result = convertDataset([{ text: 'already text' }], 'text')
    expect(result.lossy).toBe(false)
    expect(result.unchanged).toBe(1)
    expect(result.converted).toBe(0)
  })

  it('keeps every role label when flattening a conversation', () => {
    const result = convertDataset([chatRecord], 'text')
    const { text } = result.records[0] as { text: string }
    expect(text).toContain('system: You are a terse sentiment classifier.')
    expect(text).toContain('user: Classify the sentiment.')
    expect(text).toContain('assistant: positive')
  })
})

describe('convertDataset — counting', () => {
  it('separates records already in the target format from those rewritten', () => {
    const result = convertDataset([chatRecord, instructionRecord], 'chat')
    expect(result.unchanged).toBe(1)
    expect(result.converted).toBe(1)
    expect(result.records).toHaveLength(2)
  })

  it('handles an empty dataset without inventing an error', () => {
    const result = convertDataset([], 'chat')
    expect(result).toEqual({
      records: [],
      converted: 0,
      unchanged: 0,
      skipped: [],
      lossy: false,
    })
  })
})
