import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  estimateFee,
  formatOg,
  NEURON_PER_OG,
  STORAGE_RESERVE_FEE_NEURON,
} from '../src/fee.js'
import { analyzeDatasetFile, detectFormat, estimateTokenCount } from '../src/dataset.js'

const MAINNET_PRICE = 500_000_000_000n
const TESTNET_PRICE = 800_000_000_000n

describe('fee estimation — must agree with @crucible/core', () => {
  it('reproduces 0G’s documented worked example exactly', () => {
    const fee = estimateFee({
      tokenCount: 10_000,
      epochs: 3,
      pricePerTokenNeuron: MAINNET_PRICE,
      model: 'Qwen2.5-0.5B-Instruct',
    })
    expect(formatOg(fee.trainingNeuron)).toBe('0.015')
    expect(formatOg(fee.storageReserveNeuron)).toBe('0.01')
    expect(formatOg(fee.totalNeuron)).toBe('0.025')
  })

  it('prices testnet higher than mainnet, as the live contract does', () => {
    const args = { tokenCount: 1_000_000, epochs: 1, model: 'Qwen2.5-0.5B-Instruct' }
    const mainnet = estimateFee({ ...args, pricePerTokenNeuron: MAINNET_PRICE })
    const testnet = estimateFee({ ...args, pricePerTokenNeuron: TESTNET_PRICE })
    expect(formatOg(mainnet.trainingNeuron)).toBe('0.5')
    expect(formatOg(testnet.trainingNeuron)).toBe('0.8')
  })

  it('scales linearly with epochs', () => {
    const base = { tokenCount: 5_000, pricePerTokenNeuron: MAINNET_PRICE, model: 'Qwen2.5-0.5B-Instruct' }
    const one = estimateFee({ ...base, epochs: 1 })
    const three = estimateFee({ ...base, epochs: 3 })
    expect(three.trainingNeuron).toBe(one.trainingNeuron * 3n)
  })

  it('reserves more storage for the 32B model', () => {
    expect(STORAGE_RESERVE_FEE_NEURON['Qwen2.5-0.5B-Instruct']).toBe(10n ** 16n)
    expect(STORAGE_RESERVE_FEE_NEURON['Qwen3-32B']).toBe(9n * 10n ** 16n)
    expect(NEURON_PER_OG).toBe(10n ** 18n)
  })

  it('rejects an unknown model rather than guessing a reserve', () => {
    expect(() =>
      estimateFee({ tokenCount: 10, epochs: 1, pricePerTokenNeuron: MAINNET_PRICE, model: 'GPT-9' }),
    ).toThrow(/unknown model/i)
  })

  it('renders neuron amounts with no trailing zeros', () => {
    expect(formatOg(10n ** 18n)).toBe('1')
    expect(formatOg(10n ** 16n)).toBe('0.01')
    expect(formatOg(0n)).toBe('0')
  })
})

describe('dataset analysis', () => {
  it('detects 0G’s three formats using core’s rules', () => {
    expect(detectFormat({ messages: [{ role: 'user', content: 'hi' }] })).toBe('chat')
    expect(detectFormat({ instruction: 'do', input: '', output: 'done' })).toBe('instruction')
    expect(detectFormat({ instruction: 'do', output: 'done' })).toBe('instruction')
    expect(detectFormat({ text: 'hello' })).toBe('text')
    expect(detectFormat({ nope: 1 })).toBeNull()
    expect(detectFormat('string')).toBeNull()
  })

  it('estimates a token count that scales with content', () => {
    const small = estimateTokenCount([{ text: 'hi' }])
    const large = estimateTokenCount([{ text: 'x'.repeat(4000) }])
    expect(small).toBeGreaterThan(0)
    expect(large).toBeGreaterThan(small * 10)
  })

  describe('analyzeDatasetFile', () => {
    let dir: string
    const write = (name: string, content: string) => {
      dir ??= mkdtempSync(join(tmpdir(), 'crucible-ds-'))
      const p = join(dir, name)
      writeFileSync(p, content)
      return p
    }

    it('reports format, example count and a token estimate', () => {
      const lines = Array.from({ length: 12 }, (_, i) =>
        JSON.stringify({ messages: [{ role: 'user', content: `question ${i}` }] }),
      ).join('\n')
      const result = analyzeDatasetFile(write('chat.jsonl', `${lines}\n`))

      expect(result).toBeDefined()
      expect(result!.format).toBe('chat')
      expect(result!.exampleCount).toBe(12)
      expect(result!.tokenCount).toBeGreaterThan(0)
    })

    it('picks the majority format when a file is mixed', () => {
      const content =
        [
          ...Array.from({ length: 5 }, () => JSON.stringify({ text: 'a' })),
          JSON.stringify({ instruction: 'i', output: 'o' }),
        ].join('\n') + '\n'
      const result = analyzeDatasetFile(write('mixed.jsonl', content))
      expect(result!.format).toBe('text')
      expect(result!.exampleCount).toBe(6)
    })

    it('skips blank lines and unparseable lines instead of throwing', () => {
      const content = `${JSON.stringify({ text: 'a' })}\n\nnot json\n${JSON.stringify({ text: 'b' })}\n`
      const result = analyzeDatasetFile(write('messy.jsonl', content))
      expect(result!.exampleCount).toBe(2)
      expect(result!.format).toBe('text')
    })

    it('returns undefined for a missing file rather than throwing', () => {
      expect(analyzeDatasetFile(join(tmpdir(), 'definitely-not-here.jsonl'))).toBeUndefined()
    })

    it('returns undefined when no record matches a 0G format', () => {
      const result = analyzeDatasetFile(write('bad.jsonl', `${JSON.stringify({ q: 1 })}\n`))
      expect(result).toBeUndefined()
    })

    afterAll(() => {
      if (dir) rmSync(dir, { recursive: true, force: true })
    })
  })
})
