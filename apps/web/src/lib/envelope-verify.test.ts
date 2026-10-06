import { createHash, generateKeyPairSync, sign, createPublicKey, webcrypto } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { canonicalize, manifestHash } from './manifest'
import {
  DSSE_PAYLOAD_TYPE,
  PREDICATE_TYPE,
  STATEMENT_TYPE,
  pae,
  pemToDer,
  verifyEnvelopeInBrowser,
} from './envelope-verify'

beforeAll(() => {
  // Node's WebCrypto, so the test does not depend on what the DOM shim exposes.
  vi.stubGlobal('crypto', webcrypto)
})

const manifest = {
  version: 1,
  network: 'testnet',
  chainId: 16602,
  taskId: 'task-1',
  provider: '0xA02b95Aa6886b1116C4f334eDe00381511E31A09',
  baseModelHash: '0x' + 'ab'.repeat(32),
  datasetRootHash: '0x' + 'cd'.repeat(32),
  adapterRootHash: '0x' + 'ef'.repeat(32),
  configHash: '0x' + '12'.repeat(32),
}

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
const keyid = createHash('sha256')
  .update(createPublicKey(publicPem).export({ type: 'spki', format: 'der' }))
  .digest('hex')

/** Sign exactly the way `@crucible/core` does, using Node's crypto. */
function makeEnvelope(m: unknown = manifest): string {
  const statement = {
    _type: STATEMENT_TYPE,
    subject: [
      { name: 'crucible-passport', digest: { sha256: createHash('sha256').update(canonicalize(m)).digest('hex') } },
    ],
    predicateType: PREDICATE_TYPE,
    predicate: {
      manifestKeccak256: manifestHash(m as never),
      canonicalization: 'crucible-sorted-json-v1',
      manifest: m,
    },
  }
  const payload = Buffer.from(JSON.stringify(statement))
  const signature = sign(null, Buffer.from(pae(DSSE_PAYLOAD_TYPE, payload)), privateKey)
  return JSON.stringify({
    payloadType: DSSE_PAYLOAD_TYPE,
    payload: payload.toString('base64'),
    signatures: [{ keyid, sig: signature.toString('base64') }],
  })
}

describe('pae', () => {
  it('matches the DSSE v1 spec example', () => {
    const bytes = pae('http://example.com/HelloWorld', new TextEncoder().encode('hello world'))
    expect(new TextDecoder().decode(bytes)).toBe('DSSEv1 29 http://example.com/HelloWorld 11 hello world')
  })
})

describe('pemToDer', () => {
  it('decodes a PEM and rejects an empty one', () => {
    expect(pemToDer(publicPem).length).toBeGreaterThan(30)
    expect(() => pemToDer('-----BEGIN PUBLIC KEY----------END PUBLIC KEY-----')).toThrow()
  })
})

describe('verifyEnvelopeInBrowser', () => {
  it('accepts an envelope signed the way core signs, and returns the anchor hash', async () => {
    const result = await verifyEnvelopeInBrowser(makeEnvelope(), publicPem, manifestHash(manifest as never))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.keccak256).toBe(manifestHash(manifest as never))
  })

  it('rejects a different key', async () => {
    const other = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString()
    expect((await verifyEnvelopeInBrowser(makeEnvelope(), other)).ok).toBe(false)
  })

  it('rejects a tampered payload', async () => {
    const env = JSON.parse(makeEnvelope())
    const statement = JSON.parse(Buffer.from(env.payload, 'base64').toString())
    statement.predicate.manifest.taskId = 'task-2'
    env.payload = Buffer.from(JSON.stringify(statement)).toString('base64')
    const result = await verifyEnvelopeInBrowser(JSON.stringify(env), publicPem)
    expect(result).toEqual({ ok: false, reason: 'The signature does not verify.' })
  })

  it('rejects a validly signed manifest that is not the anchored one', async () => {
    const other = { ...manifest, taskId: 'task-other' }
    const result = await verifyEnvelopeInBrowser(makeEnvelope(other), publicPem, manifestHash(manifest as never))
    expect(result).toEqual({ ok: false, reason: 'The manifest does not match the hash anchored on chain.' })
  })

  it('fails cleanly on garbage input', async () => {
    expect((await verifyEnvelopeInBrowser('nope', publicPem)).ok).toBe(false)
    expect((await verifyEnvelopeInBrowser(makeEnvelope(), 'not a key')).ok).toBe(false)
    expect((await verifyEnvelopeInBrowser('{"payloadType":"x"}', publicPem)).ok).toBe(false)
  })
})
