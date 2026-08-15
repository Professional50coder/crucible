/**
 * Fee estimation, shown before any funds move.
 *
 *   Total = Training Fee + Storage Reserve Fee
 *   Training Fee = tokenCount x pricePerToken x epochs
 *
 * The broker computes the real figure at task creation, after counting tokens
 * itself. This estimate exists so the number is on screen *before* the user
 * commits — the CLI gives no warning at all until after a task is funded.
 *
 * Unit check (docs/FIELD_NOTES.md): mainnet pricePerToken 500_000_000_000 neuron
 * x 1e6 tokens / 1e18 = 0.5 0G per million tokens, which matches 0G's published
 * price exactly. That agreement is why we trust the on-chain figure.
 */

import { NEURON_PER_OG } from './format'
import type { FeeBreakdown } from './types'

export { NEURON_PER_OG }

/** neuron per token, verified live 2026-08-14. */
export const PRICE_PER_TOKEN_NEURON: Record<string, bigint> = {
  testnet: 800_000_000_000n,
  mainnet: 500_000_000_000n,
}

/**
 * Fixed fee reserving 0G Storage for the resulting LoRA adapter, by model size.
 * Qwen2.5-0.5B-Instruct ~100 MB → 0.01 0G; Qwen3-32B ~900 MB → 0.09 0G.
 */
export const STORAGE_RESERVE_FEE_NEURON: Record<string, bigint> = {
  'Qwen2.5-0.5B-Instruct': 10n ** 16n,
  'Qwen3-32B': 9n * 10n ** 16n,
}

export interface FeeEstimateArgs {
  tokenCount: number
  epochs: number
  pricePerTokenNeuron: bigint
  model: string
}

export function estimateFee(args: FeeEstimateArgs): FeeBreakdown {
  const { tokenCount, epochs, pricePerTokenNeuron, model } = args

  const storageReserveNeuron = STORAGE_RESERVE_FEE_NEURON[model]
  if (storageReserveNeuron === undefined) {
    throw new Error(
      `Unknown model "${model}". Known models: ${Object.keys(STORAGE_RESERVE_FEE_NEURON).join(', ')}.`,
    )
  }

  const safeTokens = BigInt(Math.max(0, Math.floor(tokenCount)))
  const safeEpochs = BigInt(Math.max(1, Math.floor(epochs)))

  const trainingNeuron = safeTokens * pricePerTokenNeuron * safeEpochs

  return {
    trainingNeuron: trainingNeuron.toString(),
    storageReserveNeuron: storageReserveNeuron.toString(),
    totalNeuron: (trainingNeuron + storageReserveNeuron).toString(),
  }
}
