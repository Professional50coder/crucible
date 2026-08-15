import type { NetworkName } from './types.js'

/**
 * Verified endpoints, per docs/INTERFACES.md §6.
 *
 * Duplicated here rather than imported from `@crucible/core` on purpose: this
 * service is a standalone npm project (its own package.json and lockfile) so
 * that installing it can never collide with the workspace. These four values
 * are stable network constants, not logic.
 */
export interface NetworkConfig {
  chainId: number
  rpcUrl: string
  explorerUrl: string
  fineTuningProvider: string
}

export const NETWORKS: Record<NetworkName, NetworkConfig> = {
  testnet: {
    chainId: 16602,
    rpcUrl: 'https://evmrpc-testnet.0g.ai',
    explorerUrl: 'https://chainscan-galileo.0g.ai',
    fineTuningProvider: '0xA02b95Aa6886b1116C4f334eDe00381511E31A09',
  },
  mainnet: {
    chainId: 16661,
    rpcUrl: 'https://evmrpc.0g.ai',
    explorerUrl: 'https://chainscan.0g.ai',
    fineTuningProvider: '0x940b4a101CaBa9be04b16A7363cafa29C1660B0d',
  },
}

export function networkFor(name: string): NetworkConfig {
  const config = NETWORKS[name as NetworkName]
  if (!config) throw new Error(`Unknown network "${name}". Expected "testnet" or "mainnet".`)
  return config
}
