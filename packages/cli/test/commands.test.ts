import { describe, expect, test } from 'vitest'
import {
  cardCommand,
  configCommand,
  convertCommand,
  validateCommand,
  verifyCommand,
} from '../src/commands.js'
import { STANDARD_TEMPLATE, buildManifest, buildModelCard, manifestHash } from '@crucible/core'
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

/**
 * The manifest actually anchored on Galileo, byte for byte (runs/manifest-1.json),
 * with the hash recorded in contracts/deployments/galileo-mints.json and README.md:133.
 * It is the earlier flat shape, not the sectioned PassportManifest — which is the
 * point: the one manifest a user can check against the chain today has to verify.
 */
const ANCHORED_MANIFEST = JSON.stringify({
  adapterRootHash: '0x418e9f5f06b5930bd8a7fcb5d50a42d7646485b169916e23b818eb5d8c5ae8eb',
  baseModelHash: '0xb4f76a886b8655c92bb021922d60b5e4d9271a5c9da98b6cb10937a06c2c75a7',
  chainId: 16602,
  configHash: '0xe65b3e5183dff7b35bb409425f55ba0f6210c726cb1e8ae83e33b8e89cca55f1',
  datasetRootHash: '0xa5051ae76e5bc0e3c64975dea37231dba744945ad50f564c9534948139e7dbfd',
  network: 'testnet',
  note: 'adapter not retrieved; acknowledgeModel failed on Windows (ENOENT) then HTTP 429',
  provider: '0xA02b95Aa6886b1116C4f334eDe00381511E31A09',
  taskId: '10551604-2664-4516-86cf-269a62f93bfc',
  version: 1,
})

const ANCHORED_HASH = '0x4f64bfe6db470029d79ede7d83b184b003ed88ea380f5f4cce81502c6059890f'

const passportManifest = () =>
  buildManifest({
    network: 'testnet',
    createdAt: '2026-08-14T10:00:00.000Z',
    task: {
      id: '0x7f3a9c1e',
      provider: '0xA02b95Aa6886b1116C4f334eDe00381511E31A09',
      state: 'Finished',
    },
    base: {
      model: 'Qwen2.5-0.5B-Instruct',
      modelHash: '0xb4f76a886b8655c92bb021922d60b5e4d9271a5c9da98b6cb10937a06c2c75a7',
      tokenizer: 'Qwen/Qwen2.5-0.5B-Instruct',
    },
    dataset: {
      rootHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
      format: 'chat',
      exampleCount: 240,
      tokenCount: 51_200,
    },
    training: STANDARD_TEMPLATE,
    adapter: {
      rootHash: '0x3333333333333333333333333333333333333333333333333333333333333333',
      sizeBytes: 8_400_000,
    },
    fee: {
      trainingNeuron: 40_960_000_000_000_000n,
      storageReserveNeuron: 10_000_000_000_000_000n,
      totalNeuron: 50_960_000_000_000_000n,
    },
    tee: {
      signerAddress: '0x24135b4Bd964872284728F79F5f17eB874C5583A',
      acknowledged: true,
      attestationVerified: true,
    },
  })

describe('verifyCommand', () => {
  test('reproduces the hash anchored on Galileo for the real manifest', () => {
    const r = verifyCommand(ANCHORED_MANIFEST, 'manifest-1.json')
    expect(r.code).toBe(0)
    expect(text(r.lines)).toContain(ANCHORED_HASH)
    // stdout carries the bare hash so a script can compare it without parsing.
    expect(r.output).toBe(`${ANCHORED_HASH}\n`)
  })

  test('--expect against the anchored hash passes and exits 0', () => {
    const r = verifyCommand(ANCHORED_MANIFEST, 'manifest-1.json', ANCHORED_HASH)
    expect(r.code).toBe(0)
    expect(text(r.lines)).toContain('matches the expected hash')
  })

  test('key order is irrelevant — that is what canonicalization buys', () => {
    const shuffled = JSON.stringify(
      Object.fromEntries(Object.entries(JSON.parse(ANCHORED_MANIFEST)).reverse()),
    )
    expect(verifyCommand(shuffled, 'shuffled.json', ANCHORED_HASH).code).toBe(0)
  })

  test('one changed byte fails, and both hashes are printed', () => {
    const tampered = JSON.parse(ANCHORED_MANIFEST) as Record<string, unknown>
    tampered['note'] = 'adapter retrieved'
    const r = verifyCommand(JSON.stringify(tampered), 'tampered.json', ANCHORED_HASH)
    expect(r.code).toBe(1)
    expect(text(r.lines)).toContain('does not match')
    expect(text(r.lines)).toContain(ANCHORED_HASH)
  })

  test('a checksum-cased or padded expected hash still matches', () => {
    const r = verifyCommand(ANCHORED_MANIFEST, 'm.json', `  ${ANCHORED_HASH.toUpperCase()}  `)
    expect(r.code).toBe(0)
  })

  test('verifies a current-shape passport manifest too', () => {
    const manifest = passportManifest()
    const r = verifyCommand(JSON.stringify(manifest), 'm.json', manifestHash(manifest))
    expect(r.code).toBe(0)
  })

  test('a non-JSON file exits 1 rather than throwing', () => {
    expect(verifyCommand('{oops', 'm.json').code).toBe(1)
    expect(verifyCommand('[1,2]', 'm.json').code).toBe(1)
  })
})

describe('cardCommand', () => {
  test('prints a Hugging Face card carrying the manifest hash', () => {
    const manifest = passportManifest()
    const r = cardCommand(JSON.stringify(manifest), 'm.json')
    expect(r.code).toBe(0)
    expect(r.output).toBe(buildModelCard(manifest))
    expect(r.output).toContain(manifestHash(manifest))
    // The Hub reads the YAML front matter; it has to be the first bytes.
    expect(r.output?.startsWith('---')).toBe(true)
  })

  test('--license lands in the front matter', () => {
    const r = cardCommand(JSON.stringify(passportManifest()), 'm.json', 'apache-2.0')
    expect(r.code).toBe(0)
    expect(r.output).toContain('apache-2.0')
  })

  test('a manifest without the passport sections is refused, not crashed on', () => {
    const r = cardCommand(ANCHORED_MANIFEST, 'manifest-1.json')
    expect(r.code).toBe(1)
    expect(text(r.lines)).toContain('cannot build a model card')
  })

  test('a non-JSON file exits 1', () => {
    expect(cardCommand('{oops', 'm.json').code).toBe(1)
  })
})
