/**
 * Verify a signed passport envelope entirely in the browser.
 *
 * This is the in-page counterpart of `verifyEnvelope` in `@crucible/core` and
 * `crucible verify-envelope` in the CLI: DSSE v1 pre-authentication encoding, an
 * ed25519 signature, and an in-toto Statement carrying the manifest. It uses the
 * browser's own WebCrypto, needs no wallet, no server and no 0G RPC, and nothing
 * the reader pastes leaves the page.
 *
 * What a pass means: the holder of that key signed exactly this manifest, and
 * (when an anchor is given) the manifest hashes to the value published on chain.
 * It does not mean the training was honest — Crucible proves lineage, not honest
 * training.
 *
 * The constants below mirror `packages/core/src/dsse.ts`. If they ever disagree,
 * core is right and this is a bug; the test signs with Node's crypto the way core
 * does, so a drift fails the suite.
 */

import { manifestHash } from './manifest'
import { canonicalize } from './manifest'
import type { PassportManifest } from './types'

export const DSSE_PAYLOAD_TYPE = 'application/vnd.in-toto+json'
export const STATEMENT_TYPE = 'https://in-toto.io/Statement/v1'
export const PREDICATE_TYPE = 'https://crucible.0g/passport-lineage/v1'

export interface DsseEnvelope {
  payloadType: string
  payload: string
  signatures: { keyid: string; sig: string }[]
}

export interface PassportStatement {
  _type: string
  subject: { name: string; digest: { sha256: string } }[]
  predicateType: string
  predicate: { manifestKeccak256: string; manifest: PassportManifest }
}

export type EnvelopeCheck =
  | { ok: true; statement: PassportStatement; keccak256: string }
  | { ok: false; reason: string }

const enc = new TextEncoder()

const fail = (reason: string): EnvelopeCheck => ({ ok: false, reason })

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64.replace(/\s+/g, ''))
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
}

const toHex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')

/** Strip the PEM armour and decode the DER body. */
export function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----(BEGIN|END)[^-]+-----/g, '').replace(/\s+/g, '')
  if (body === '') throw new Error('empty key')
  return base64ToBytes(body)
}

/** DSSE v1 PAE: `DSSEv1 <len(type)> <type> <len(body)> <body>`. */
export function pae(payloadType: string, payload: Uint8Array): Uint8Array {
  const type = enc.encode(payloadType)
  const head = enc.encode(`DSSEv1 ${type.length} `)
  const mid = enc.encode(` ${payload.length} `)
  const out = new Uint8Array(head.length + type.length + mid.length + payload.length)
  out.set(head, 0)
  out.set(type, head.length)
  out.set(mid, head.length + type.length)
  out.set(payload, head.length + type.length + mid.length)
  return out
}

/**
 * Check an envelope against a public key (SPKI PEM) and an optional on-chain
 * anchor. Never throws: anything malformed is a failed verification.
 */
export async function verifyEnvelopeInBrowser(
  envelopeJson: string,
  publicKeyPem: string,
  expectedKeccak256?: string,
): Promise<EnvelopeCheck> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return fail('This browser cannot verify signatures (WebCrypto is unavailable).')

  let envelope: DsseEnvelope
  try {
    envelope = JSON.parse(envelopeJson) as DsseEnvelope
  } catch {
    return fail('The envelope is not valid JSON.')
  }
  if (envelope?.payloadType !== DSSE_PAYLOAD_TYPE) return fail('Unexpected payload type.')

  let der: Uint8Array
  try {
    der = pemToDer(publicKeyPem)
  } catch {
    return fail('The public key is not a valid PEM.')
  }

  let key: CryptoKey
  try {
    key = await subtle.importKey('spki', der, { name: 'Ed25519' }, false, ['verify'])
  } catch {
    return fail(
      'This browser could not read that key as ed25519. Use a current Chrome, Edge, Safari or Firefox.',
    )
  }

  try {
    const keyid = toHex(await subtle.digest('SHA-256', der))
    const candidate = envelope.signatures?.find((s) => s.keyid === keyid)
    if (!candidate) return fail('No signature in this envelope was made by that key.')

    const payload = base64ToBytes(envelope.payload)
    const valid = await subtle.verify(
      'Ed25519',
      key,
      base64ToBytes(candidate.sig),
      pae(envelope.payloadType, payload),
    )
    if (!valid) return fail('The signature does not verify.')

    const statement = JSON.parse(new TextDecoder().decode(payload)) as PassportStatement
    if (statement._type !== STATEMENT_TYPE || statement.predicateType !== PREDICATE_TYPE) {
      return fail('Unexpected statement type.')
    }

    const manifest = statement.predicate.manifest
    const keccak = manifestHash(manifest)
    if (keccak.toLowerCase() !== statement.predicate.manifestKeccak256.toLowerCase()) {
      return fail('The manifest does not match the hash it claims.')
    }
    const sha = toHex(await subtle.digest('SHA-256', enc.encode(canonicalize(manifest))))
    if (sha !== statement.subject[0]?.digest.sha256) {
      return fail('The manifest does not match the signed subject digest.')
    }
    if (expectedKeccak256 && keccak.toLowerCase() !== expectedKeccak256.trim().toLowerCase()) {
      return fail('The manifest does not match the hash anchored on chain.')
    }
    return { ok: true, statement, keccak256: keccak }
  } catch {
    return fail('The envelope is malformed.')
  }
}
