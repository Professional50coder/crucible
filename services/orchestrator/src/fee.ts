/**
 * Fee estimation, mirroring `@crucible/core`'s `fee.ts`.
 *
 *   Total Fee    = Training Fee + Storage Reserve Fee
 *   Training Fee = tokenCount x pricePerToken x epochs
 *
 * Duplicated rather than imported because this service is a standalone npm
 * project (own package.json and lockfile) and must not become a workspace
 * member. `test/estimate.test.ts` pins the same worked example core pins —
 * 10k tokens, 3 epochs, Qwen2.5-0.5B on mainnet = 0.025 0G — so the two
 * implementations cannot silently drift apart.
 *
 * The orchestrator only ever reports this as a *display* estimate. The broker
 * computes the real fee after counting tokens itself.
 */

/** 1 0G = 1e18 neuron. */
export const NEURON_PER_OG = 10n ** 18n

/** Fixed reserve for storing the resulting LoRA adapter, by model size. */
export const STORAGE_RESERVE_FEE_NEURON: Record<string, bigint> = {
  'Qwen2.5-0.5B-Instruct': 10n ** 16n,
  'Qwen3-32B': 9n * 10n ** 16n,
}

export interface FeeEstimateArgs {
  tokenCount: number
  epochs: number
  /** From the live contract — `ServiceStructOutput.pricePerToken`. */
  pricePerTokenNeuron: bigint
  model: string
}

export interface FeeEstimate {
  trainingNeuron: bigint
  storageReserveNeuron: bigint
  totalNeuron: bigint
}

/** Exact decimal rendering of a neuron amount in 0G, with no trailing zeros. */
export function formatOg(neuron: bigint): string {
  const whole = neuron / NEURON_PER_OG
  const fraction = neuron % NEURON_PER_OG
  if (fraction === 0n) return whole.toString()
  const padded = fraction.toString().padStart(18, '0').replace(/0+$/, '')
  return `${whole}.${padded}`
}

export function estimateFee(args: FeeEstimateArgs): FeeEstimate {
  const { tokenCount, epochs, pricePerTokenNeuron, model } = args

  const storageReserveNeuron = STORAGE_RESERVE_FEE_NEURON[model]
  if (storageReserveNeuron === undefined) {
    throw new Error(
      `Unknown model "${model}". Known models: ${Object.keys(STORAGE_RESERVE_FEE_NEURON).join(', ')}.`,
    )
  }

  const trainingNeuron = BigInt(tokenCount) * pricePerTokenNeuron * BigInt(epochs)
  return {
    trainingNeuron,
    storageReserveNeuron,
    totalNeuron: trainingNeuron + storageReserveNeuron,
  }
}
