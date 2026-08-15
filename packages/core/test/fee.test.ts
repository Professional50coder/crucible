import { describe, expect, test } from 'vitest'
import { estimateFee, STORAGE_RESERVE_FEE_NEURON, NEURON_PER_OG } from '../src/fee.js'

// Live values read from the network on 2026-08-14 (see docs/FIELD_NOTES.md).
const MAINNET_PRICE_PER_TOKEN = 500_000_000_000n // neuron
const TESTNET_PRICE_PER_TOKEN = 800_000_000_000n // neuron

describe('estimateFee', () => {
  test("reproduces the worked example from 0G's docs exactly", () => {
    // Docs: 10,000 tokens, 3 epochs, Qwen2.5-0.5B-Instruct
    //   price per million tokens = 0.5 0G
    //   training fee = (10000/1e6) * 0.5 * 3 = 0.015 0G
    //   storage reserve = 0.01 0G
    //   total = 0.025 0G
    const fee = estimateFee({
      tokenCount: 10_000,
      epochs: 3,
      pricePerTokenNeuron: MAINNET_PRICE_PER_TOKEN,
      model: 'Qwen2.5-0.5B-Instruct',
    })

    expect(fee.trainingOg).toBe('0.015')
    expect(fee.storageReserveOg).toBe('0.01')
    expect(fee.totalOg).toBe('0.025')
  })

  test('derives 0.5 0G per million tokens from the live mainnet price', () => {
    const fee = estimateFee({
      tokenCount: 1_000_000,
      epochs: 1,
      pricePerTokenNeuron: MAINNET_PRICE_PER_TOKEN,
      model: 'Qwen2.5-0.5B-Instruct',
    })

    expect(fee.trainingOg).toBe('0.5')
  })

  test('testnet costs more per token than mainnet for identical work', () => {
    const args = { tokenCount: 1_000_000, epochs: 1, model: 'Qwen2.5-0.5B-Instruct' } as const

    const mainnet = estimateFee({ ...args, pricePerTokenNeuron: MAINNET_PRICE_PER_TOKEN })
    const testnet = estimateFee({ ...args, pricePerTokenNeuron: TESTNET_PRICE_PER_TOKEN })

    expect(testnet.trainingOg).toBe('0.8')
    expect(mainnet.trainingNeuron < testnet.trainingNeuron).toBe(true)
  })

  test('charges the larger storage reserve for Qwen3-32B', () => {
    const fee = estimateFee({
      tokenCount: 0,
      epochs: 1,
      pricePerTokenNeuron: MAINNET_PRICE_PER_TOKEN,
      model: 'Qwen3-32B',
    })

    expect(fee.storageReserveOg).toBe('0.09')
  })

  test('scales linearly with epochs', () => {
    const one = estimateFee({
      tokenCount: 50_000,
      epochs: 1,
      pricePerTokenNeuron: MAINNET_PRICE_PER_TOKEN,
      model: 'Qwen2.5-0.5B-Instruct',
    })
    const three = estimateFee({
      tokenCount: 50_000,
      epochs: 3,
      pricePerTokenNeuron: MAINNET_PRICE_PER_TOKEN,
      model: 'Qwen2.5-0.5B-Instruct',
    })

    expect(three.trainingNeuron).toBe(one.trainingNeuron * 3n)
  })

  test('rejects an unknown model rather than guessing a storage reserve', () => {
    expect(() =>
      estimateFee({
        tokenCount: 100,
        epochs: 1,
        pricePerTokenNeuron: MAINNET_PRICE_PER_TOKEN,
        model: 'Llama-3-8B',
      }),
    ).toThrow('Unknown model "Llama-3-8B"')
  })
})

describe('constants', () => {
  test('1 0G is 1e18 neuron, matching the price derivation', () => {
    expect(NEURON_PER_OG).toBe(10n ** 18n)
  })

  test('storage reserve fees match the published figures', () => {
    expect(STORAGE_RESERVE_FEE_NEURON['Qwen2.5-0.5B-Instruct']).toBe(10n ** 16n) // 0.01 0G
    expect(STORAGE_RESERVE_FEE_NEURON['Qwen3-32B']).toBe(9n * 10n ** 16n) // 0.09 0G
  })
})
