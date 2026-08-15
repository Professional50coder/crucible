import { describe, expect, it } from 'vitest'

import { PRICE_PER_TOKEN_NEURON, STORAGE_RESERVE_FEE_NEURON, estimateFee } from './fee'
import { formatOg } from './format'

describe('estimateFee', () => {
  it('multiplies tokens by price by epochs', () => {
    const fee = estimateFee({
      tokenCount: 1_000_000,
      epochs: 1,
      pricePerTokenNeuron: PRICE_PER_TOKEN_NEURON['mainnet']!,
      model: 'Qwen2.5-0.5B-Instruct',
    })

    // 0G documents 0.5 0G per million tokens on mainnet.
    expect(formatOg(fee.trainingNeuron)).toBe('0.5')
  })

  it('scales linearly with epochs', () => {
    const one = estimateFee({
      tokenCount: 100_000,
      epochs: 1,
      pricePerTokenNeuron: 500_000_000_000n,
      model: 'Qwen2.5-0.5B-Instruct',
    })
    const three = estimateFee({
      tokenCount: 100_000,
      epochs: 3,
      pricePerTokenNeuron: 500_000_000_000n,
      model: 'Qwen2.5-0.5B-Instruct',
    })

    expect(BigInt(three.trainingNeuron)).toBe(BigInt(one.trainingNeuron) * 3n)
  })

  it('adds the model’s fixed storage reserve fee', () => {
    const fee = estimateFee({
      tokenCount: 0,
      epochs: 1,
      pricePerTokenNeuron: 500_000_000_000n,
      model: 'Qwen3-32B',
    })

    expect(fee.storageReserveNeuron).toBe(STORAGE_RESERVE_FEE_NEURON['Qwen3-32B']!.toString())
    expect(formatOg(fee.totalNeuron)).toBe('0.09')
  })

  it('makes testnet more expensive than mainnet, as the live contract does', () => {
    const args = { tokenCount: 1_000_000, epochs: 1, model: 'Qwen2.5-0.5B-Instruct' }

    const testnet = estimateFee({ ...args, pricePerTokenNeuron: PRICE_PER_TOKEN_NEURON['testnet']! })
    const mainnet = estimateFee({ ...args, pricePerTokenNeuron: PRICE_PER_TOKEN_NEURON['mainnet']! })

    expect(BigInt(testnet.trainingNeuron)).toBeGreaterThan(BigInt(mainnet.trainingNeuron))
    expect(formatOg(testnet.trainingNeuron)).toBe('0.8')
  })

  it('returns strings, so the values survive JSON', () => {
    const fee = estimateFee({
      tokenCount: 271_480,
      epochs: 3,
      pricePerTokenNeuron: 500_000_000_000n,
      model: 'Qwen2.5-0.5B-Instruct',
    })

    expect(typeof fee.totalNeuron).toBe('string')
    expect(BigInt(fee.totalNeuron)).toBe(
      BigInt(fee.trainingNeuron) + BigInt(fee.storageReserveNeuron),
    )
  })

  it('refuses to guess at an unknown model’s storage fee', () => {
    expect(() =>
      estimateFee({
        tokenCount: 10,
        epochs: 1,
        pricePerTokenNeuron: 500_000_000_000n,
        model: 'Llama-3-8B',
      }),
    ).toThrow(/Unknown model/)
  })

  it('tolerates fractional token estimates without producing a BigInt error', () => {
    const fee = estimateFee({
      tokenCount: 1234.7,
      epochs: 2,
      pricePerTokenNeuron: 500_000_000_000n,
      model: 'Qwen2.5-0.5B-Instruct',
    })
    expect(BigInt(fee.trainingNeuron)).toBe(1234n * 500_000_000_000n * 2n)
  })
})
