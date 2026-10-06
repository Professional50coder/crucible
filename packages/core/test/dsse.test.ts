import { describe, expect, test } from 'vitest'
import { buildManifest, manifestHash, type PassportInput } from '../src/passport.js'
import { STANDARD_TEMPLATE } from '../src/training-config.js'
import {
  DSSE_PAYLOAD_TYPE,
  buildStatement,
  generateSigningKey,
  pae,
  signManifest,
  verifyEnvelope,
} from '../src/dsse.js'

const INPUT: PassportInput = {
  network: 'testnet',
  createdAt: '2026-08-14T10:00:00.000Z',
  task: { id: '0x7f3a9c1e', provider: '0xA02b95Aa6886b1116C4f334eDe00381511E31A09', state: 'Finished' },
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

const manifest = buildManifest(INPUT)
const keys = generateSigningKey()

describe('pae', () => {
  test('matches the DSSE v1 spec example shape', () => {
    expect(pae('http://example.com/HelloWorld', Buffer.from('hello world')).toString()).toBe(
      'DSSEv1 29 http://example.com/HelloWorld 11 hello world',
    )
  })
})

describe('signManifest / verifyEnvelope', () => {
  test('round-trips and binds to the on-chain keccak256 anchor', () => {
    const envelope = signManifest(manifest, keys.privateKeyPem, keys.publicKeyPem)
    expect(envelope.payloadType).toBe(DSSE_PAYLOAD_TYPE)
    const result = verifyEnvelope(envelope, keys.publicKeyPem, manifestHash(manifest))
    expect(result.ok).toBe(true)
    expect(result.statement?.predicate.manifestKeccak256).toBe(manifestHash(manifest))
  })

  test('statement carries a sha256 subject and the keccak anchor', () => {
    const statement = buildStatement(manifest)
    expect(statement.subject[0].digest.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(statement.predicate.manifestKeccak256).toBe(manifestHash(manifest))
  })

  test('rejects a different key', () => {
    const envelope = signManifest(manifest, keys.privateKeyPem, keys.publicKeyPem)
    const other = generateSigningKey()
    expect(verifyEnvelope(envelope, other.publicKeyPem).ok).toBe(false)
  })

  test('rejects a tampered payload', () => {
    const envelope = signManifest(manifest, keys.privateKeyPem, keys.publicKeyPem)
    const statement = JSON.parse(Buffer.from(envelope.payload, 'base64').toString())
    statement.predicate.manifest.dataset.exampleCount = 999
    const tampered = { ...envelope, payload: Buffer.from(JSON.stringify(statement)).toString('base64') }
    const result = verifyEnvelope(tampered, keys.publicKeyPem)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/signature/)
  })

  test('a validly signed but different manifest fails the on-chain anchor check', () => {
    const other = buildManifest({ ...INPUT, dataset: { ...INPUT.dataset, exampleCount: 241 } })
    const envelope = signManifest(other, keys.privateKeyPem, keys.publicKeyPem)
    const result = verifyEnvelope(envelope, keys.publicKeyPem, manifestHash(manifest))
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/on-chain anchor/)
  })

  test('a wrong payloadType fails', () => {
    const envelope = signManifest(manifest, keys.privateKeyPem, keys.publicKeyPem)
    expect(verifyEnvelope({ ...envelope, payloadType: 'text/plain' }, keys.publicKeyPem).ok).toBe(false)
  })

  test('never throws on garbage', () => {
    const garbage = { payloadType: DSSE_PAYLOAD_TYPE, payload: '!!!', signatures: [] }
    expect(verifyEnvelope(garbage, keys.publicKeyPem).ok).toBe(false)
  })
})
