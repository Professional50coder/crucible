/**
 * Fee estimation for 0G Compute fine-tuning tasks.
 *
 *   Total Fee = Training Fee + Storage Reserve Fee
 *   Training Fee = (tokenCount / 1e6) x pricePerMillionTokens x epochs
 *
 * The broker calculates the real fee after counting your dataset's tokens. This
 * estimate exists so a user sees the cost *before* funds move — the CLI gives no
 * warning until after a task is created.
 *
 * ## Unit derivation (verified)
 *
 * The contract exposes `pricePerToken` in **neuron**. The docs quote price per
 * *million* tokens in **0G**. These reconcile at 1 0G = 1e18 neuron:
 *
 *   live mainnet pricePerToken = 500_000_000_000 neuron
 *   x 1e6 tokens                = 5e17 neuron
 *   / 1e18                      = 0.5 0G per million tokens   ← matches the docs exactly
 *
 * That agreement is what lets us trust the on-chain figure over the documented one,
 * which matters because testnet and mainnet are priced differently (800 vs 500).
 */

/** 1 0G = 1e18 neuron. Confirmed by the price derivation above. */
export const NEURON_PER_OG = 10n ** 18n

/**
 * Fixed fee reserving storage for the resulting LoRA adapter, by model size.
 * Qwen2.5-0.5B-Instruct ~100 MB → 0.01 0G; Qwen3-32B ~900 MB → 0.09 0G.
 */
export const STORAGE_RESERVE_FEE_NEURON: Record<string, bigint> = {
  'Qwen2.5-0.5B-Instruct': 10n ** 16n,
  'Qwen3-32B': 9n * 10n ** 16n,
}

export interface FeeEstimateArgs {
  /** Total tokens in the dataset. The broker counts these itself; this is our estimate. */
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
  trainingOg: string
  storageReserveOg: string
  totalOg: string
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
  const totalNeuron = trainingNeuron + storageReserveNeuron

  return {
    trainingNeuron,
    storageReserveNeuron,
    totalNeuron,
    trainingOg: formatOg(trainingNeuron),
    storageReserveOg: formatOg(storageReserveNeuron),
    totalOg: formatOg(totalNeuron),
  }
}
