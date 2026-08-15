import { describe, expect, test } from 'vitest'
import {
  type PassportInput,
  type PassportManifest,
  STORAGE_SCAN_URLS,
  buildManifest,
  canonicalize,
  manifestHash,
  verifyManifest,
  explorerLinks,
} from '../src/passport.js'
import { STANDARD_TEMPLATE } from '../src/training-config.js'
import { NETWORKS } from '../src/networks.js'

const VALID_INPUT: PassportInput = {
  network: 'testnet',
  createdAt: '2026-08-14T10:00:00.000Z',
  task: {
    id: '0x7f3a9c1e',
    provider: '0xA02b95Aa6886b1116C4f334eDe00381511E31A09',
    state: 'Finished',
  },
  // Per docs/INTERFACES.md: `model` carries no "Qwen/" prefix, `tokenizer` does.
  base: {
    model: 'Qwen2.5-0.5B-Instruct',
    modelHash: '0xb4f76a886b8655c92bb021922d60b5e4d9271a5c9da98b6cb10937a06c2c75a7',
    tokenizer: 'Qwen/Qwen2.5-0.5B-Instruct',
  },
  dataset: {
    rootHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
    format: 'chat',
    exampleCount: 240,
    tokenCount: 51_200,
  },
  training: STANDARD_TEMPLATE,
  adapter: {
    rootHash: '0x3333333333333333333333333333333333333333333333333333333333333333',
    sizeBytes: 8_400_000,
  },
  fee: {
    trainingNeuron: 40_960_000_000_000_000n,
    storageReserveNeuron: 10_000_000_000_000_000n,
    totalNeuron: 50_960_000_000_000_000n,
  },
  tee: {
    signerAddress: '0x24135b4Bd964872284728F79F5f17eB874C5583A',
    acknowledged: true,
    attestationVerified: true,
  },
}

/** Deep clone that reverses key order at every level — the enemy of a naive JSON.stringify. */
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys)
  if (typeof value !== 'object' || value === null) return value

  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>).reverse()) {
    out[key] = reverseKeys((value as Record<string, unknown>)[key])
  }
  return out
}

/** Canonicalize an arbitrary shape — the invariant must hold for more than whole manifests. */
const canon = (value: unknown): string => canonicalize(value as PassportManifest)

describe('buildManifest', () => {
  test('produces a version-1 manifest with the chain ID derived from the network', () => {
    const manifest = buildManifest(VALID_INPUT)

    expect(manifest.version).toBe(1)
    expect(manifest.network).toBe('testnet')
    expect(manifest.chainId).toBe(NETWORKS.testnet.chainId)
  })

  test('stores fees as decimal strings so the manifest survives JSON.stringify', () => {
    const manifest = buildManifest(VALID_INPUT)

    expect(manifest.fee.trainingNeuron).toBe('40960000000000000')
    expect(manifest.fee.totalNeuron).toBe('50960000000000000')
    expect(typeof manifest.fee.storageReserveNeuron).toBe('string')
    expect(() => JSON.stringify(manifest)).not.toThrow()
  })

  test('accepts fees that are already strings', () => {
    const manifest = buildManifest({
      ...VALID_INPUT,
      fee: {
        trainingNeuron: '40960000000000000',
        storageReserveNeuron: '10000000000000000',
        totalNeuron: '50960000000000000',
      },
    })

    expect(manifest.fee.trainingNeuron).toBe('40960000000000000')
  })

  test('defaults createdAt to now, as a valid ISO 8601 instant', () => {
    const { createdAt: _omitted, ...withoutCreatedAt } = VALID_INPUT
    const manifest = buildManifest(withoutCreatedAt)

    expect(manifest.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(Number.isNaN(Date.parse(manifest.createdAt))).toBe(false)
  })

  test('names the missing field when a required value is absent', () => {
    const broken = {
      ...VALID_INPUT,
      dataset: { ...VALID_INPUT.dataset, rootHash: '' },
    }

    expect(() => buildManifest(broken)).toThrow('dataset.rootHash')
  })

  test('names a missing nested section rather than throwing a TypeError', () => {
    const broken = { ...VALID_INPUT, tee: undefined } as unknown as PassportInput

    expect(() => buildManifest(broken)).toThrow('tee')
  })

  test('rejects an unknown network with the same message networkFor gives', () => {
    const broken = { ...VALID_INPUT, network: 'devnet' } as unknown as PassportInput

    expect(() => buildManifest(broken)).toThrow('Unknown network "devnet"')
  })

  test('rejects a training config 0G would reject, before any funds move', () => {
    const broken = {
      ...VALID_INPUT,
      training: { ...STANDARD_TEMPLATE, per_device_train_batch_size: 16 },
    }

    expect(() => buildManifest(broken)).toThrow('per_device_train_batch_size')
  })

  test('omits sizeBytes entirely when it is not known', () => {
    const manifest = buildManifest({
      ...VALID_INPUT,
      adapter: { rootHash: VALID_INPUT.adapter.rootHash },
    })

    expect('sizeBytes' in manifest.adapter).toBe(false)
  })
})

describe('canonicalize', () => {
  test('is byte-identical regardless of key insertion order', () => {
    const manifest = buildManifest(VALID_INPUT)
    const shuffled = reverseKeys(manifest) as PassportManifest

    // Sanity check: the shuffle really did change the naive encoding.
    expect(JSON.stringify(shuffled)).not.toBe(JSON.stringify(manifest))
    expect(canonicalize(shuffled)).toBe(canonicalize(manifest))
  })

  test('emits no whitespace at all', () => {
    expect(canonicalize(buildManifest(VALID_INPUT))).not.toMatch(/[\s]/)
  })

  test('sorts keys recursively, not just at the top level', () => {
    const canonical = canonicalize(buildManifest(VALID_INPUT))

    expect(canonical.indexOf('"adapter"')).toBeLessThan(canonical.indexOf('"base"'))
    // Inside `training`, learning_rate must precede max_steps.
    expect(canonical.indexOf('"learning_rate"')).toBeLessThan(canonical.indexOf('"max_steps"'))
    // Inside `dataset`, exampleCount must precede format, rootHash, tokenCount.
    expect(canonical.indexOf('"exampleCount"')).toBeLessThan(canonical.indexOf('"tokenCount"'))
  })

  test('preserves array order — only object keys get sorted', () => {
    expect(canon({ z: [3, 1, 2], a: 1 })).toBe('{"a":1,"z":[3,1,2]}')
  })

  test('never sorts arrays — element order is content, not presentation', () => {
    const nested = {
      messages: [
        { role: 'user', content: 'b' },
        { role: 'assistant', content: 'a' },
      ],
      nested: { list: [['z', 'a'], [3, 1, 2]] },
    }

    expect(canon(nested)).toBe(
      '{"messages":[{"content":"b","role":"user"},{"content":"a","role":"assistant"}],' +
        '"nested":{"list":[["z","a"],[3,1,2]]}}',
    )
  })

  test('sorts keys at every level of a deeply nested structure', () => {
    const deep = {
      z: { y: { x: { c: 3, a: 1, b: 2 } } },
      a: [{ q: 1, p: 2 }],
    }

    expect(canon(deep)).toBe('{"a":[{"p":2,"q":1}],"z":{"y":{"x":{"a":1,"b":2,"c":3}}}}')
  })

  test('is order-independent for a deeply nested structure, at every level', () => {
    const deep = {
      z: { y: { x: { c: 3, a: 1, b: 2 } }, w: [1, 2] },
      a: { n: 'x', m: { j: true, i: null } },
    }

    expect(canon(reverseKeys(deep))).toBe(canon(deep))
  })

  test('sorts unicode keys by code unit, identically whatever order they arrive in', () => {
    const unicode = { 'é': 1, 'z': 2, 'a': 3, '日': 4, '🔥': 5 }

    expect(canon(unicode)).toBe(canon(reverseKeys(unicode)))
    // Code-unit order, never locale order: a < z < é < 日 < 🔥 (surrogate pair sorts last).
    expect(canon(unicode)).toBe('{"a":3,"z":2,"é":1,"日":4,"🔥":5}')
  })

  test('round-trips unicode values byte-for-byte', () => {
    const value = { text: 'café 日本語 🔥 "quoted" \\ back\nslash' }

    expect(JSON.parse(canon(value))).toEqual(value)
    expect(canon(value)).toBe(canon(JSON.parse(canon(value))))
  })

  test('keeps learning_rate in decimal notation — 0G rejects 2e-4', () => {
    const canonical = canonicalize(buildManifest(VALID_INPUT))

    expect(canonical).toContain('"learning_rate":0.0002')
    expect(canonical).not.toContain('e-')
  })

  test('refuses a bigint rather than letting JSON.stringify throw something cryptic', () => {
    const withBigint = { fee: { totalNeuron: 1n } }

    expect(() => canon(withBigint)).toThrow('fee.totalNeuron')
    expect(() => canon(withBigint)).toThrow(/bigint/i)
  })

  test('refuses NaN and Infinity, which JSON.stringify would silently turn into null', () => {
    expect(() => canon({ dataset: { tokenCount: NaN } })).toThrow('dataset.tokenCount')
    expect(() => canon({ dataset: { tokenCount: Infinity } })).toThrow('dataset.tokenCount')
    expect(() => canon({ a: [1, -Infinity] })).toThrow('a[1]')
  })

  test('produces identical bytes for two independently built identical manifests', () => {
    expect(canonicalize(buildManifest(VALID_INPUT))).toBe(canonicalize(buildManifest(VALID_INPUT)))
  })

  test('survives a JSON round-trip unchanged — the orchestrator sends these over HTTP', () => {
    const manifest = buildManifest(VALID_INPUT)
    const overTheWire: PassportManifest = JSON.parse(JSON.stringify(manifest))

    expect(canonicalize(overTheWire)).toBe(canonicalize(manifest))
    expect(manifestHash(overTheWire)).toBe(manifestHash(manifest))
  })

  test('treats an explicitly undefined field the same as an absent one', () => {
    const absent = buildManifest({
      ...VALID_INPUT,
      adapter: { rootHash: VALID_INPUT.adapter.rootHash },
    })
    const explicit = buildManifest({
      ...VALID_INPUT,
      adapter: { rootHash: VALID_INPUT.adapter.rootHash, sizeBytes: undefined },
    })

    expect(canonicalize(explicit)).toBe(canonicalize(absent))
  })
})

describe('manifestHash', () => {
  test('is a 0x-prefixed 32-byte keccak256 digest', () => {
    expect(manifestHash(buildManifest(VALID_INPUT))).toMatch(/^0x[0-9a-f]{64}$/)
  })

  test('is stable across key reordering — this is what makes the on-chain hash mean anything', () => {
    const manifest = buildManifest(VALID_INPUT)
    expect(manifestHash(reverseKeys(manifest) as PassportManifest)).toBe(manifestHash(manifest))
  })

  test('changes when any field changes', () => {
    const base = buildManifest(VALID_INPUT)
    const baseHash = manifestHash(base)

    const mutations: PassportManifest[] = [
      { ...base, network: 'mainnet' },
      { ...base, chainId: 16661 },
      { ...base, createdAt: '2026-08-14T10:00:00.001Z' },
      { ...base, task: { ...base.task, state: 'Delivered' } },
      { ...base, task: { ...base.task, id: '0x7f3a9c1f' } },
      { ...base, base: { ...base.base, tokenizer: 'other' } },
      { ...base, dataset: { ...base.dataset, exampleCount: 241 } },
      { ...base, training: { ...base.training, max_steps: 4 } },
      { ...base, adapter: { ...base.adapter, sizeBytes: 8_400_001 } },
      { ...base, fee: { ...base.fee, totalNeuron: '50960000000000001' } },
      { ...base, tee: { ...base.tee, attestationVerified: false } },
    ]

    for (const mutated of mutations) {
      expect(manifestHash(mutated)).not.toBe(baseHash)
    }

    // Every mutation must also be distinct from every other, not merely from the base.
    const hashes = mutations.map(manifestHash)
    expect(new Set(hashes).size).toBe(mutations.length)
  })

  test('a single flipped boolean changes the hash — attestation cannot be quietly downgraded', () => {
    const honest = buildManifest(VALID_INPUT)
    const lying = buildManifest({
      ...VALID_INPUT,
      tee: { ...VALID_INPUT.tee, attestationVerified: false },
    })

    expect(manifestHash(lying)).not.toBe(manifestHash(honest))
  })
})

describe('verifyManifest', () => {
  test('accepts the manifest that produced the hash', () => {
    const manifest = buildManifest(VALID_INPUT)
    expect(verifyManifest(manifest, manifestHash(manifest))).toBe(true)
  })

  test('accepts a reordered but identical manifest', () => {
    const manifest = buildManifest(VALID_INPUT)
    const hash = manifestHash(manifest)

    expect(verifyManifest(reverseKeys(manifest) as PassportManifest, hash)).toBe(true)
  })

  test('rejects a tampered manifest', () => {
    const manifest = buildManifest(VALID_INPUT)
    const hash = manifestHash(manifest)
    const tampered: PassportManifest = {
      ...manifest,
      dataset: { ...manifest.dataset, rootHash: '0xdeadbeef' },
    }

    expect(verifyManifest(tampered, hash)).toBe(false)
  })

  test('is case-insensitive about the expected hash', () => {
    const manifest = buildManifest(VALID_INPUT)
    const hash = manifestHash(manifest)

    expect(verifyManifest(manifest, hash.toUpperCase().replace('0X', '0x'))).toBe(true)
  })

  test('rejects a malformed expected hash instead of throwing', () => {
    const manifest = buildManifest(VALID_INPUT)
    expect(verifyManifest(manifest, 'not-a-hash')).toBe(false)
  })
})

describe('explorerLinks', () => {
  test('points storage links at the Galileo Storage Scan for testnet', () => {
    const links = explorerLinks(buildManifest(VALID_INPUT))

    expect(links.storageDataset).toBe(
      `${STORAGE_SCAN_URLS.testnet}/api/txs?skip=0&limit=10&rootHash=${VALID_INPUT.dataset.rootHash}`,
    )
    expect(links.storageAdapter).toBe(
      `${STORAGE_SCAN_URLS.testnet}/api/txs?skip=0&limit=10&rootHash=${VALID_INPUT.adapter.rootHash}`,
    )
  })

  test('never emits the /file/<rootHash> route, which the explorer 404s', () => {
    const links = explorerLinks(buildManifest(VALID_INPUT))

    expect(links.storageDataset).not.toContain('/file/')
    expect(links.storageAdapter).not.toContain('/file/')
  })

  test('points storage links at mainnet Storage Scan for mainnet', () => {
    const links = explorerLinks(buildManifest({ ...VALID_INPUT, network: 'mainnet' }))

    expect(links.storageDataset.startsWith('https://storagescan.0g.ai/')).toBe(true)
  })

  test('points the provider link at the chain explorer for the manifest network', () => {
    const links = explorerLinks(buildManifest(VALID_INPUT))

    expect(links.chainProvider).toBe(
      `${NETWORKS.testnet.explorerUrl}/address/${VALID_INPUT.task.provider}`,
    )
  })

  test('knows a Storage Scan host for every network', () => {
    for (const network of Object.keys(NETWORKS)) {
      expect(STORAGE_SCAN_URLS[network as keyof typeof STORAGE_SCAN_URLS]).toMatch(
        /^https:\/\/storagescan/,
      )
    }
  })
})
