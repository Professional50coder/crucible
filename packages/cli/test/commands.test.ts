import { describe, expect, test } from 'vitest'
import { configCommand, convertCommand, validateCommand } from '../src/commands.js'
import { plain } from '../src/format.js'

const text = (lines: string[]) => plain(lines.join('\n'))

/** 0G requires at least 10 examples, so every valid fixture has to clear that. */
const chatRecord = (i: number) =>
  JSON.stringify({
    messages: [
      { role: 'user', content: `question ${i}` },
      { role: 'assistant', content: `answer ${i}` },
    ],
  })

const validChat = (n = 10) =>
  Array.from({ length: n }, (_, i) => chatRecord(i)).join('\n') + '\n'

const instructionRecord = (i: number, input = '') =>
  JSON.stringify({ instruction: `do ${i}`, input, output: `done ${i}` })

const validInstruction = (n = 10) =>
  Array.from({ length: n }, (_, i) => instructionRecord(i)).join('\n') + '\n'

describe('validateCommand', () => {
  test('a clean dataset exits 0', () => {
    const r = validateCommand(validChat(), 'good.jsonl')
    expect(r.code).toBe(0)
    expect(text(r.lines)).toContain('good.jsonl is a valid 0G dataset')
  })

  test('too few examples exits 1 and states the minimum', () => {
    const r = validateCommand(validChat(3), 'short.jsonl')
    expect(r.code).toBe(1)
    expect(text(r.lines)).toContain('at least 10')
  })

  test('CRLF is caught — the failure that survives record-level validation', () => {
    const r = validateCommand(validChat().replace(/\n/g, '\r\n'), 'windows.jsonl')
    expect(r.code).toBe(1)
    expect(text(r.lines)).toContain('CRLF')
  })

  test('a BOM is caught', () => {
    const r = validateCommand('﻿' + validChat(), 'bom.jsonl')
    expect(r.code).toBe(1)
    expect(text(r.lines)).toContain('BOM')
  })

  test('a blank line is caught with its line number', () => {
    const r = validateCommand(validChat().replace('\n', '\n\n'), 'blank.jsonl')
    expect(r.code).toBe(1)
    expect(text(r.lines)).toContain('Line 2 is blank')
  })

  test('mixed formats are caught', () => {
    const r = validateCommand(validChat(9) + instructionRecord(99) + '\n', 'mixed.jsonl')
    expect(r.code).toBe(1)
    expect(text(r.lines)).toContain('mixes formats')
  })

  test('an empty file exits 1', () => {
    const r = validateCommand('', 'empty.jsonl')
    expect(r.code).toBe(1)
    expect(text(r.lines)).toContain('empty')
  })

  test('each error is on its own line', () => {
    const r = validateCommand('﻿' + validChat(2), 'bad.jsonl')
    // header + one line per error, nothing concatenated
    expect(r.lines.length).toBeGreaterThan(2)
    for (const line of r.lines.slice(1)) expect(line.trimStart()).not.toBe('')
  })
})

describe('configCommand', () => {
  const template = {
    neftune_noise_alpha: 5,
    num_train_epochs: 1,
    per_device_train_batch_size: 2,
    learning_rate: 0.0002,
    max_steps: 3,
  }

  test("0G's standard template exits 0", () => {
    const r = configCommand(JSON.stringify(template), 'config.json')
    expect(r.code).toBe(0)
    expect(text(r.lines)).toContain('valid 0G training config')
  })

  test('an extra parameter exits 1 — the broker rejects these after funding', () => {
    const r = configCommand(JSON.stringify({ ...template, warmup_steps: 10 }), 'config.json')
    expect(r.code).toBe(1)
    expect(text(r.lines)).toContain('warmup_steps')
  })

  test('an out-of-range learning rate exits 1', () => {
    const r = configCommand(JSON.stringify({ ...template, learning_rate: 0.5 }), 'config.json')
    expect(r.code).toBe(1)
    expect(text(r.lines)).toContain('learning_rate')
  })

  test('malformed JSON exits 1 without throwing', () => {
    const r = configCommand('{not json', 'config.json')
    expect(r.code).toBe(1)
    expect(text(r.lines)).toContain('not valid JSON')
  })

  test('a JSON array is rejected', () => {
    const r = configCommand('[]', 'config.json')
    expect(r.code).toBe(1)
    expect(text(r.lines)).toContain('JSON object')
  })
})

describe('convertCommand', () => {
  test('instruction to chat round-trips through core', () => {
    const r = convertCommand(validInstruction(), 'chat', 'in.jsonl')
    expect(r.code).toBe(0)
    expect(text(r.lines)).toContain('10 converted, 0 already chat')

    const first = JSON.parse((r.output ?? '').split('\n')[0] ?? '{}')
    expect(first).toEqual({
      messages: [
        { role: 'user', content: 'do 0' },
        { role: 'assistant', content: 'done 0' },
      ],
    })
  })

  test('records already in the target format count as unchanged', () => {
    const r = convertCommand(validChat(), 'chat', 'in.jsonl')
    expect(text(r.lines)).toContain('0 converted, 10 already chat')
  })

  test('converting to text is announced as lossy', () => {
    const r = convertCommand(validChat(), 'text', 'in.jsonl')
    expect(r.code).toBe(0)
    const out = text(r.lines)
    expect(out).toContain('LOSSY')
    expect(out).toContain('cannot be converted back')
  })

  test('a lossless conversion never claims to be lossy', () => {
    expect(text(convertCommand(validInstruction(), 'chat', 'in.jsonl').lines)).not.toContain('LOSSY')
  })

  test('every skipped record is printed with its line number and reason', () => {
    // A three-turn conversation has nowhere to go in the instruction format.
    const multiTurn = JSON.stringify({
      messages: [
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
        { role: 'user', content: 'c' },
        { role: 'assistant', content: 'd' },
      ],
    })
    const r = convertCommand(validChat(2) + multiTurn + '\n', 'instruction', 'in.jsonl')

    const out = text(r.lines)
    expect(out).toContain('line 3 skipped')
    expect(out).toContain('lose')
    // The two convertible records still came out.
    expect((r.output ?? '').trim().split('\n')).toHaveLength(2)
  })

  test('skipped line numbers refer to the file, not the record index', () => {
    // Blank lines are not records, so core's record index would say line 2.
    const r = convertCommand(chatRecord(0) + '\n\n' + '{"nope":1}\n', 'instruction', 'in.jsonl')
    expect(text(r.lines)).toContain('line 3 skipped')
  })

  test('text cannot be converted back into a structured format', () => {
    const r = convertCommand('{"text":"hello"}\n', 'chat', 'in.jsonl')
    expect(r.code).toBe(1)
    const out = text(r.lines)
    expect(out).toContain('inventing')
    expect(out).toContain('nothing converted')
  })

  test('a file with no readable records exits 1', () => {
    const r = convertCommand('not json at all\n', 'chat', 'in.jsonl')
    expect(r.code).toBe(1)
    expect(text(r.lines)).toContain('no readable JSON records')
  })

  test('output is valid JSONL: one object per line, trailing newline', () => {
    const out = convertCommand(validInstruction(), 'chat', 'in.jsonl').output ?? ''
    expect(out.endsWith('\n')).toBe(true)
    expect(out).not.toContain('\n\n')
    for (const line of out.trimEnd().split('\n')) expect(() => JSON.parse(line)).not.toThrow()
  })

  test('converted output passes validate', () => {
    const out = convertCommand(validInstruction(), 'chat', 'in.jsonl').output ?? ''
    expect(validateCommand(out, 'out.jsonl').code).toBe(0)
  })
})
