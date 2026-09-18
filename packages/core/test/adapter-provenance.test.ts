import { describe, expect, test } from 'vitest'
import {
  type PassportInput,
  type PassportManifest,
  buildManifest,
  canonicalize,
  manifestHash,
} from '../src/passport.js'
import {
  assertAdapterProvenance,
  isVerifiedAdapterRoot,
  sentinelAdapterHash,
  buildModelCard,
} from '../src/modelcard.js'
import { STANDARD_TEMPLATE } from '../src/training-config.js'

const BASE_INPUT: PassportInput = {
  network: 'testnet',
  createdAt: '2026-08-14T10:00:00.000Z',
  task: {
    id: '0x7f3a9c1e',
    provider: '0xA02b95Aa6886b1116C4f334eDe00381511E31A09',
    state: 'Finished',
  },
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

function withAdapter(overrides: Partial<PassportInput['adapter']>): PassportInput {
  return { ...BASE_INPUT, adapter: { ...BASE_INPUT.adapter, ...overrides } }
}

describe('adapter.hashSource — provenance on the manifest', () => {
  test('is absent by default, so legacy manifests hash identically', () => {
    const legacy = buildManifest(BASE_INPUT)
    expect('hashSource' in legacy.adapter).toBe(false)

    // A manifest that only differs by an ABSENT hashSource must be byte-identical.
    const explicitUndefined = buildManifest(withAdapter({ hashSource: undefined }))
    expect(canonicalize(explicitUndefined)).toBe(canonicalize(legacy))
    expect(manifestHash(explicitUndefined)).toBe(manifestHash(legacy))
  })

  test('records an explicit onchain-verified source', () => {
    const manifest = buildManifest(withAdapter({ hashSource: 'onchain-verified' }))
    expect(manifest.adapter.hashSource).toBe('onchain-verified')
  })

  test('records an explicit sentinel source', () => {
    const manifest = buildManifest(
      withAdapter({ rootHash: sentinelAdapterHash(BASE_INPUT.task.id), hashSource: 'sentinel' }),
    )
    expect(manifest.adapter.hashSource).toBe('sentinel')
  })

  test('rejects a hashSource that is neither value', () => {
    expect(() =>
      buildManifest(withAdapter({ hashSource: 'trust-me' as unknown as 'sentinel' })),
    ).toThrow(/adapter\.hashSource/)
  })

  test('setting hashSource changes the canonical hash (it is real content)', () => {
    const legacy = buildManifest(BASE_INPUT)
    const verified = buildManifest(withAdapter({ hashSource: 'onchain-verified' }))
    expect(manifestHash(verified)).not.toBe(manifestHash(legacy))
  })
})

describe('assertAdapterProvenance — a sentinel can never be verified', () => {
  test('refuses onchain-verified on a sentinel hash', () => {
    // Build without the contradictory field, then set it to force the illegal shape.
    const manifest = buildManifest(
      withAdapter({ rootHash: sentinelAdapterHash(BASE_INPUT.task.id), hashSource: 'sentinel' }),
    )
    const lying: PassportManifest = {
      ...manifest,
      adapter: { ...manifest.adapter, hashSource: 'onchain-verified' },
    }
    expect(() => assertAdapterProvenance(lying)).toThrow(/impossible|sentinel/i)
    expect(isVerifiedAdapterRoot(lying)).toBe(false)
  })

  test('refuses sentinel provenance on a real-looking root', () => {
    const manifest = buildManifest(withAdapter({ hashSource: 'onchain-verified' }))
    const lying: PassportManifest = {
      ...manifest,
      adapter: { ...manifest.adapter, hashSource: 'sentinel' },
    }
    expect(() => assertAdapterProvenance(lying)).toThrow(/inconsistent|not the sentinel/i)
  })

  test('accepts a consistent verified manifest', () => {
    const manifest = buildManifest(withAdapter({ hashSource: 'onchain-verified' }))
    expect(() => assertAdapterProvenance(manifest)).not.toThrow()
    expect(isVerifiedAdapterRoot(manifest)).toBe(true)
  })

  test('accepts a consistent sentinel manifest but never calls it verified', () => {
    const manifest = buildManifest(
      withAdapter({ rootHash: sentinelAdapterHash(BASE_INPUT.task.id), hashSource: 'sentinel' }),
    )
    expect(() => assertAdapterProvenance(manifest)).not.toThrow()
    expect(isVerifiedAdapterRoot(manifest)).toBe(false)
  })

  test('leaves a pre-provenance manifest (no hashSource) alone', () => {
    const manifest = buildManifest(BASE_INPUT)
    expect(() => assertAdapterProvenance(manifest)).not.toThrow()
    expect(isVerifiedAdapterRoot(manifest)).toBe(false)
  })
})

describe('buildModelCard refuses to publish a mislabelled sentinel', () => {
  test('throws when a sentinel is dressed up as onchain-verified', () => {
    const manifest = buildManifest(
      withAdapter({ rootHash: sentinelAdapterHash(BASE_INPUT.task.id), hashSource: 'sentinel' }),
    )
    const lying: PassportManifest = {
      ...manifest,
      adapter: { ...manifest.adapter, hashSource: 'onchain-verified' },
    }
    expect(() => buildModelCard(lying)).toThrow(/impossible|sentinel/i)
  })

  test('still renders an honest verified card', () => {
    const manifest = buildManifest(withAdapter({ hashSource: 'onchain-verified' }))
    const card = buildModelCard(manifest)
    expect(card).toContain('0G Storage root hash')
  })
})
