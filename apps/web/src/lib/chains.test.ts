import { describe, expect, it } from 'vitest'

import {
  NETWORKS,
  STORAGE_SCAN_URLS,
  addressUrl,
  explorerLinks,
  networkByChainId,
  storageLookupUrl,
  storageSubmissionUrl,
  txUrl,
} from './chains'
import { buildPassports } from './mock/fixtures'

describe('network configuration', () => {
  it('pins the verified chain ids', () => {
    expect(NETWORKS.testnet.chainId).toBe(16602)
    expect(NETWORKS.mainnet.chainId).toBe(16661)
  })

  it('resolves a network from its chain id', () => {
    expect(networkByChainId(16661)?.name).toBe('mainnet')
    expect(networkByChainId(16602)?.name).toBe('testnet')
    expect(networkByChainId(1)).toBeUndefined()
  })

  it('lists Qwen3-32B on mainnet only', () => {
    expect(NETWORKS.mainnet.models).toContain('Qwen3-32B')
    expect(NETWORKS.testnet.models).not.toContain('Qwen3-32B')
  })
})

describe('Storage Scan host selection', () => {
  it('uses a different host per network', () => {
    // Feeding a testnet root hash to the mainnet host returns "not found",
    // which on a provenance page reads as the data being gone rather than the
    // URL being wrong.
    expect(STORAGE_SCAN_URLS.mainnet).toBe('https://storagescan.0g.ai')
    expect(STORAGE_SCAN_URLS.testnet).toBe('https://storagescan-galileo.0g.ai')
    expect(STORAGE_SCAN_URLS.mainnet).not.toBe(STORAGE_SCAN_URLS.testnet)
  })

  it('looks a root hash up through the API route, because /file/<rootHash> is a 404', () => {
    // Storage Scan has no page keyed by root hash. Its human route is
    // /submission/<txSeq>, and a txSeq cannot be derived from a root hash
    // without asking the explorer first. A working JSON URL beats a pretty 404 —
    // on a provenance page a 404 reads as "the data is gone", not "wrong URL".
    const hash = `0x${'a'.repeat(64)}`

    expect(storageLookupUrl('testnet', hash)).toBe(
      `https://storagescan-galileo.0g.ai/api/txs?skip=0&limit=10&rootHash=${hash}`,
    )
    expect(storageLookupUrl('mainnet', hash)).toBe(
      `https://storagescan.0g.ai/api/txs?skip=0&limit=10&rootHash=${hash}`,
    )
    expect(storageLookupUrl('testnet', hash)).not.toContain('/file/')
  })

  it('builds the human submission page only from a txSeq', () => {
    expect(storageSubmissionUrl('testnet', 146937)).toBe(
      'https://storagescan-galileo.0g.ai/submission/146937',
    )
  })
})

describe('chainscan host selection', () => {
  it('uses a different explorer per network', () => {
    expect(addressUrl('mainnet', '0xabc')).toContain('chainscan.0g.ai')
    expect(addressUrl('testnet', '0xabc')).toContain('chainscan-galileo.0g.ai')
    expect(txUrl('testnet', '0xdef')).toBe('https://chainscan-galileo.0g.ai/tx/0xdef')
  })
})

describe('explorerLinks', () => {
  it('derives every verification link from one manifest, so hosts cannot mismatch', () => {
    for (const { manifest } of buildPassports()) {
      const links = explorerLinks(manifest)
      const expectedStorage = STORAGE_SCAN_URLS[manifest.network]
      const expectedChain = NETWORKS[manifest.network].explorerUrl

      expect(links.dataset.startsWith(expectedStorage)).toBe(true)
      expect(links.adapter.startsWith(expectedStorage)).toBe(true)
      expect(links.provider.startsWith(expectedChain)).toBe(true)
      expect(links.teeSigner.startsWith(expectedChain)).toBe(true)

      expect(links.dataset).toContain(manifest.dataset.rootHash)
      expect(links.adapter).toContain(manifest.adapter.rootHash)
    }
  })

  it('never points a testnet passport at the mainnet storage explorer', () => {
    const testnetPassports = buildPassports().filter((p) => p.manifest.network === 'testnet')
    expect(testnetPassports.length).toBeGreaterThan(0)

    for (const { manifest } of testnetPassports) {
      expect(explorerLinks(manifest).dataset).toContain('storagescan-galileo')
    }
  })
})
