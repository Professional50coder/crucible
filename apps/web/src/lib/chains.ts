/**
 * 0G network configuration and the explorer-link builders that make a passport
 * independently verifiable.
 *
 * Every value verified live on 2026-08-14 — see docs/FIELD_NOTES.md. Note that
 * fine-tuning IS available on mainnet (0G's own example repo says otherwise) and
 * mainnet is 37.5% cheaper per token.
 */

import type { Network } from './types'

export interface NetworkConfig {
  name: Network
  label: string
  chainId: number
  rpcUrl: string
  indexerUrl: string
  explorerUrl: string
  explorerLabel: string
  symbol: string
  models: string[]
  /** Verified available on 2026-08-14. The orchestrator discovers this live. */
  fineTuningProvider: string
}

export const NETWORKS: Record<Network, NetworkConfig> = {
  testnet: {
    name: 'testnet',
    label: '0G Galileo',
    chainId: 16602,
    rpcUrl: 'https://evmrpc-testnet.0g.ai',
    indexerUrl: 'https://indexer-storage-testnet-turbo.0g.ai',
    explorerUrl: 'https://chainscan-galileo.0g.ai',
    explorerLabel: 'chainscan-galileo.0g.ai',
    symbol: '0G',
    models: ['Qwen2.5-0.5B-Instruct'],
    fineTuningProvider: '0xA02b95Aa6886b1116C4f334eDe00381511E31A09',
  },
  mainnet: {
    name: 'mainnet',
    label: '0G',
    chainId: 16661,
    rpcUrl: 'https://evmrpc.0g.ai',
    indexerUrl: 'https://indexer-storage-turbo.0g.ai',
    explorerUrl: 'https://chainscan.0g.ai',
    explorerLabel: 'chainscan.0g.ai',
    symbol: '0G',
    models: ['Qwen2.5-0.5B-Instruct', 'Qwen3-32B'],
    fineTuningProvider: '0x940b4a101CaBa9be04b16A7363cafa29C1660B0d',
  },
}

/**
 * 0G Storage Scan is a SEPARATE DEPLOYMENT PER NETWORK, not one host.
 *
 * Feeding a testnet root hash to the mainnet host returns "not found" — which on
 * a provenance page a reader interprets as *the data is gone*, not *the URL is
 * wrong*. On a page whose only job is letting a stranger check a claim, that is
 * indistinguishable from the claim being false. Always select by
 * `manifest.network`, exactly as with chainscan.
 */
export const STORAGE_SCAN_URLS: Record<Network, string> = {
  mainnet: 'https://storagescan.0g.ai',
  testnet: 'https://storagescan-galileo.0g.ai',
}

export function networkFor(name: Network): NetworkConfig {
  return NETWORKS[name]
}

export function networkByChainId(chainId: number): NetworkConfig | undefined {
  return Object.values(NETWORKS).find((n) => n.chainId === chainId)
}

export function addressUrl(network: Network, address: string): string {
  return `${NETWORKS[network].explorerUrl}/address/${address}`
}

export function txUrl(network: Network, hash: string): string {
  return `${NETWORKS[network].explorerUrl}/tx/${hash}`
}

export function blockUrl(network: Network, block: number | string): string {
  return `${NETWORKS[network].explorerUrl}/block/${block}`
}

export function tokenUrl(network: Network, contract: string, tokenId: string): string {
  return `${NETWORKS[network].explorerUrl}/token/${contract}?a=${tokenId}`
}

/**
 * 0G Storage file page for a root hash — how a stranger checks a dataset exists.
 * The network argument is mandatory precisely so a caller cannot forget it.
 */
export function storageUrl(network: Network, rootHash: string): string {
  return `${STORAGE_SCAN_URLS[network]}/file/${rootHash}`
}

export function storageScanHost(network: Network): string {
  return STORAGE_SCAN_URLS[network].replace('https://', '')
}

/**
 * Wagmi/viem chain definitions. Declared inline rather than pulled from
 * viem/chains so the chain IDs stay pinned to what we verified.
 */
export interface ExplorerLinks {
  dataset: string
  adapter: string
  provider: string
  teeSigner: string
  storageHost: string
  chainHost: string
}

/**
 * Every verification link a passport needs, derived from one manifest so the
 * network can never be mismatched between two of them.
 *
 * `@crucible/core` exports an equivalent `explorerLinks(manifest)`. When this app
 * stops mocking, delete this and import that one.
 */
export function explorerLinks(manifest: {
  network: Network
  dataset: { rootHash: string }
  adapter: { rootHash: string }
  task: { provider: string }
  tee: { signerAddress: string }
}): ExplorerLinks {
  const { network } = manifest

  return {
    dataset: storageUrl(network, manifest.dataset.rootHash),
    adapter: storageUrl(network, manifest.adapter.rootHash),
    provider: addressUrl(network, manifest.task.provider),
    teeSigner: addressUrl(network, manifest.tee.signerAddress),
    storageHost: storageScanHost(network),
    chainHost: NETWORKS[network].explorerLabel,
  }
}

export const zgGalileo = {
  id: 16602,
  name: '0G-Galileo-Testnet',
  nativeCurrency: { name: '0G', symbol: '0G', decimals: 18 },
  rpcUrls: { default: { http: ['https://evmrpc-testnet.0g.ai'] } },
  blockExplorers: {
    default: { name: '0G Chainscan', url: 'https://chainscan-galileo.0g.ai' },
  },
} as const

export const zgMainnet = {
  id: 16661,
  name: '0G',
  nativeCurrency: { name: '0G', symbol: '0G', decimals: 18 },
  rpcUrls: { default: { http: ['https://evmrpc.0g.ai'] } },
  blockExplorers: {
    default: { name: '0G Chainscan', url: 'https://chainscan.0g.ai' },
  },
} as const
