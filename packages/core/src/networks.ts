/**
 * 0G network configuration.
 *
 * All values verified live on 2026-08-14 — see docs/FIELD_NOTES.md. Note that
 * fine-tuning IS available on mainnet, contrary to the comment in 0G's own
 * `fine-tuning-example/.env.example`, and mainnet is cheaper per token.
 */

export type Network = 'testnet' | 'mainnet'

export interface NetworkConfig {
  name: Network
  chainId: number
  rpcUrl: string
  indexerUrl: string
  explorerUrl: string
  /** Fine-tuning models available on this network. */
  models: string[]
  /** Verified available on 2026-08-14. Discover live rather than trusting this. */
  knownFineTuningProvider: string
}

export const NETWORKS: Record<Network, NetworkConfig> = {
  testnet: {
    name: 'testnet',
    chainId: 16602,
    rpcUrl: 'https://evmrpc-testnet.0g.ai',
    indexerUrl: 'https://indexer-storage-testnet-turbo.0g.ai',
    explorerUrl: 'https://chainscan-galileo.0g.ai',
    models: ['Qwen2.5-0.5B-Instruct'],
    knownFineTuningProvider: '0xA02b95Aa6886b1116C4f334eDe00381511E31A09',
  },
  mainnet: {
    name: 'mainnet',
    chainId: 16661,
    rpcUrl: 'https://evmrpc.0g.ai',
    indexerUrl: 'https://indexer-storage-turbo.0g.ai',
    explorerUrl: 'https://chainscan.0g.ai',
    models: ['Qwen2.5-0.5B-Instruct', 'Qwen3-32B'],
    knownFineTuningProvider: '0x940b4a101CaBa9be04b16A7363cafa29C1660B0d',
  },
}

export function networkFor(name: string): NetworkConfig {
  const config = NETWORKS[name as Network]
  if (!config) {
    throw new Error(`Unknown network "${name}". Expected "testnet" or "mainnet".`)
  }
  return config
}
