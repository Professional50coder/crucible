import { describe, expect, test } from 'vitest'
import { USAGE, parseArgs } from '../src/cli.js'
import { CHARS_PER_TOKEN, estimateTokenCount, parseJsonlLoosely } from '../src/tokens.js'

describe('parseArgs', () => {
  test('no arguments still means doctor on the default network', () => {
    // Preserved from the original CLI: `crucible` with no args was `doctor`.
    expect(parseArgs([], 'testnet')).toEqual({ kind: 'doctor', network: 'testnet' })
  })

  test('a network positional is honoured', () => {
    expect(parseArgs(['doctor', 'mainnet'], 'testnet')).toEqual({
      kind: 'doctor',
      network: 'mainnet',
    })
  })

  test('--dataset is picked up in either position', () => {
    expect(parseArgs(['doctor', '--dataset', 'a.jsonl', 'mainnet'])).toEqual({
      kind: 'doctor',
      network: 'mainnet',
      dataset: 'a.jsonl',
    })
    expect(parseArgs(['doctor', 'mainnet', '--dataset', 'a.jsonl'])).toEqual({
      kind: 'doctor',
      network: 'mainnet',
      dataset: 'a.jsonl',
    })
  })

  test('a flag with no value is an error, not a silently missing file', () => {
    expect(parseArgs(['doctor', '--dataset'])).toMatchObject({ kind: 'error' })
    expect(parseArgs(['convert', 'a.jsonl', '--to'])).toMatchObject({ kind: 'error' })
  })

  test('validate and config take one path', () => {
    expect(parseArgs(['validate', 'd.jsonl'])).toEqual({ kind: 'validate', file: 'd.jsonl' })
    expect(parseArgs(['config', 'c.json'])).toEqual({ kind: 'config', file: 'c.json' })
    expect(parseArgs(['validate'])).toMatchObject({ kind: 'error' })
    expect(parseArgs(['config'])).toMatchObject({ kind: 'error' })
  })

  test('convert needs a file and a --to', () => {
    expect(parseArgs(['convert', 'd.jsonl', '--to', 'chat'])).toEqual({
      kind: 'convert',
      file: 'd.jsonl',
      to: 'chat',
    })
    expect(parseArgs(['convert', 'd.jsonl'])).toMatchObject({ kind: 'error' })
    expect(parseArgs(['convert', '--to', 'chat'])).toMatchObject({ kind: 'error' })
  })

  test('--out is optional and does not swallow the file path', () => {
    expect(parseArgs(['convert', 'in.jsonl', '--to', 'text', '--out', 'out.jsonl'])).toEqual({
      kind: 'convert',
      file: 'in.jsonl',
      to: 'text',
      out: 'out.jsonl',
    })
  })

  test('an unknown format is rejected by name, listing the three real ones', () => {
    const r = parseArgs(['convert', 'd.jsonl', '--to', 'alpaca'])
    expect(r.kind).toBe('error')
    expect(r.kind === 'error' && r.message).toContain('alpaca')
    expect(r.kind === 'error' && r.message).toContain('instruction')
  })

  test('an unknown command lists the available ones', () => {
    const r = parseArgs(['deploy'])
    expect(r.kind).toBe('error')
    expect(r.kind === 'error' && r.message).toContain('deploy')
    expect(r.kind === 'error' && r.message).toContain('validate')
  })

  test('help is reachable three ways', () => {
    for (const arg of ['help', '--help', '-h']) {
      expect(parseArgs([arg])).toEqual({ kind: 'help' })
    }
  })
})

describe('USAGE', () => {
  test('documents every command the parser accepts', () => {
    for (const cmd of ['doctor', 'validate', 'convert', 'config']) {
      expect(USAGE).toContain(`crucible ${cmd}`)
    }
  })

  test('says outright that token counts are estimates', () => {
    expect(USAGE).toContain('estimates')
    expect(USAGE).toContain('calculateToken')
  })
})

describe('estimateTokenCount', () => {
  test('is the repo-wide ~4-chars-per-token rule', () => {
    expect(CHARS_PER_TOKEN).toBe(4)
    // {"text":"aaaa"} is 16 serialised characters.
    expect(estimateTokenCount([{ text: 'aaaa' }])).toBe(4)
  })

  test('an empty dataset is zero tokens, not one', () => {
    expect(estimateTokenCount([])).toBe(0)
  })

  test('grows with the data', () => {
    expect(estimateTokenCount([{ text: 'a'.repeat(400) }])).toBeGreaterThan(
      estimateTokenCount([{ text: 'a'.repeat(100) }]),
    )
  })
})

describe('parseJsonlLoosely', () => {
  test('skips blank and unparseable lines rather than failing the count', () => {
    expect(parseJsonlLoosely('{"a":1}\n\nnot json\n{"b":2}\n')).toEqual([{ a: 1 }, { b: 2 }])
  })

  test('tolerates a BOM, which validate reports separately', () => {
    expect(parseJsonlLoosely('﻿{"a":1}\n')).toEqual([{ a: 1 }])
  })
})
