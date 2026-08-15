import { describe, expect, it } from 'vitest'

import { canonicalHash, canonicalize, configHash, hashUtf8, manifestHash } from './manifest'
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
  it('anchor the real hash of the document they say was hashed, so verification is not staged', () => {
    // The passport page recomputes the anchored hash in the reader's browser and
    // compares. That check is only worth showing if it can genuinely fail, which
    // means the anchor must be the true hash of the document the record names —
    // `anchoredManifest` where the token committed to a different shape than
    // this app's v1 manifest, and the manifest itself otherwise.
    for (const passport of buildPassports(Date.parse('2026-08-14T00:00:00.000Z'))) {
      const hashed = passport.anchoredManifest ?? passport.manifest
      expect(passport.mint.manifestRootHash).toBe(canonicalHash(hashed))
      expect(passport.mint.configHash).toBe(configHash(passport.manifest.training))
    }
  })

  it('reproduces the hash actually anchored on chain for passport #1', () => {
    // Not a self-consistency check: this is the value in
    // contracts/deployments/galileo-mints.json, written by a transaction on 0G
    // Galileo. If this ever fails, the page is showing a claim the chain does
    // not support.
    const real = buildPassports().find((p) => p.id === 'p-000001')!

    expect(real.mint.txHash).toBe(
      '0xb608a8a5eeed36baa04c338ffed54b93458b1486b0cc66739fe36d68e400b3b1',
    )
    expect(real.mint.manifestRootHash).toBe(
      '0x4f64bfe6db470029d79ede7d83b184b003ed88ea380f5f4cce81502c6059890f',
    )
    expect(canonicalHash(real.anchoredManifest!)).toBe(real.mint.manifestRootHash)
    expect(real.mint.configHash).toBe(
      '0xe65b3e5183dff7b35bb409425f55ba0f6210c726cb1e8ae83e33b8e89cca55f1',
    )
  })

  it('carries a recomputable sentinel rather than a plausible adapter hash', () => {
    // The honesty constraint, pinned: passport #1's adapter field must be
    // provably not an adapter, and provably so from the published preimage.
    const real = buildPassports().find((p) => p.id === 'p-000001')!

    expect(real.adapterOrigin?.kind).toBe('sentinel')
    expect(real.manifest.adapter.rootHash).toBe(hashUtf8(real.adapterOrigin!.sentinelPreimage!))
    // No adapter means no adapter size. An invented one would be the same lie in
    // a quieter field.
    expect(real.manifest.adapter.sizeBytes).toBeUndefined()
    // 0G reports the task Finished, and that is recorded faithfully — but the
    // attestation is checked on acknowledgement, which never happened.
    expect(real.manifest.task.state).toBe('Finished')
    expect(real.manifest.tee.attestationVerified).toBe(false)

    // The provider's `Finished` must never stand alone. The on-chain settlement
    // is the fact that decides whether a model exists, and here it does not:
    // acknowledged is false and 0G took 30% of the fee.
    expect(real.settlement?.acknowledged).toBe(false)
    expect(real.settlement?.penaltyNeuron).toBe('3555840000000000')
    expect(real.caveat?.body).toMatch(/Nobody here holds this model; it is gone/i)
  })

  it('marks every fabricated record as a demo record', () => {
    // A demo hash rendered beside a live explorer link teaches the reader that
    // the links are decorative. The UI keys off this flag to refuse that.
    const passports = buildPassports()
    expect(passports.filter((p) => p.provenance === 'chain')).toHaveLength(2)
    expect(passports.every((p) => p.provenance === 'chain' || p.provenance === 'demo')).toBe(true)
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
