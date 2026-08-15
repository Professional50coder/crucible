import { describe, expect, it } from 'vitest'

import { canonicalize, configHash, manifestHash } from './manifest'
import { buildPassports } from './mock/fixtures'
import type { PassportManifest } from './types'

describe('canonicalize', () => {
  it('sorts object keys recursively', () => {
    expect(canonicalize({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}')
  })

  it('produces byte-identical output regardless of key insertion order', () => {
    // INTERFACES.md §1 calls this the single most important invariant in the
    // system: if it does not hold, the on-chain anchor means nothing.
    const a = { network: 'mainnet', chainId: 16661, version: 1 }
    const b = { version: 1, chainId: 16661, network: 'mainnet' }
    expect(canonicalize(a)).toBe(canonicalize(b))
  })

  it('emits no whitespace', () => {
    expect(canonicalize({ a: 1, b: [1, 2] })).not.toMatch(/\s/)
  })

  it('preserves array order, which is meaningful', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]')
  })

  it('drops undefined values so optional fields hash consistently', () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe(canonicalize({ a: 1 }))
  })

  it('handles nulls and nested arrays of objects', () => {
    expect(canonicalize({ a: null, b: [{ y: 1, x: 2 }] })).toBe('{"a":null,"b":[{"x":2,"y":1}]}')
  })
})

describe('manifestHash', () => {
  const manifest = buildPassports(Date.parse('2026-08-14T00:00:00.000Z'))[0]!.manifest

  it('returns a 0x-prefixed 32-byte digest', () => {
    const hash = manifestHash(manifest)
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('is stable across key reordering', () => {
    const reordered = {
      tee: manifest.tee,
      fee: manifest.fee,
      adapter: manifest.adapter,
      training: manifest.training,
      dataset: manifest.dataset,
      base: manifest.base,
      task: manifest.task,
      createdAt: manifest.createdAt,
      chainId: manifest.chainId,
      network: manifest.network,
      version: manifest.version,
    } as PassportManifest

    expect(manifestHash(reordered)).toBe(manifestHash(manifest))
  })

  it('changes when any field changes', () => {
    const tampered: PassportManifest = {
      ...manifest,
      dataset: { ...manifest.dataset, exampleCount: manifest.dataset.exampleCount + 1 },
    }
    expect(manifestHash(tampered)).not.toBe(manifestHash(manifest))
  })
})

describe('configHash', () => {
  it('is equal for two runs with the same five parameters', () => {
    const a = {
      neftune_noise_alpha: 5,
      num_train_epochs: 3,
      per_device_train_batch_size: 2,
      learning_rate: 0.0002,
      max_steps: 45,
    }
    const b = {
      max_steps: 45,
      learning_rate: 0.0002,
      per_device_train_batch_size: 2,
      num_train_epochs: 3,
      neftune_noise_alpha: 5,
    }
    expect(configHash(a)).toBe(configHash(b))
  })
})

describe('fixture passports', () => {
  it('anchor the real hash of their own manifest, so verification is not staged', () => {
    for (const passport of buildPassports(Date.parse('2026-08-14T00:00:00.000Z'))) {
      expect(passport.mint.manifestRootHash).toBe(manifestHash(passport.manifest))
      expect(passport.mint.configHash).toBe(configHash(passport.manifest.training))
    }
  })

  it('use well-formed 32-byte hashes throughout', () => {
    const hex32 = /^0x[0-9a-fA-F]{64}$/
    const address = /^0x[0-9a-fA-F]{40}$/

    for (const { manifest, mint } of buildPassports()) {
      expect(manifest.base.modelHash).toMatch(hex32)
      expect(manifest.dataset.rootHash).toMatch(hex32)
      expect(manifest.adapter.rootHash).toMatch(hex32)
      expect(manifest.task.provider).toMatch(address)
      expect(manifest.tee.signerAddress).toMatch(address)
      if (mint.txHash) expect(mint.txHash).toMatch(hex32)
    }
  })
})
