import { describe, expect, it } from 'vitest'

import {
  NETWORKS,
  STORAGE_SCAN_URLS,
  addressUrl,
  explorerLinks,
  networkByChainId,
  storageUrl,
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

  it('builds file URLs against the right host', () => {
    const hash = `0x${'a'.repeat(64)}`
    expect(storageUrl('testnet', hash)).toBe(`https://storagescan-galileo.0g.ai/file/${hash}`)
    expect(storageUrl('mainnet', hash)).toBe(`https://storagescan.0g.ai/file/${hash}`)
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
