import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto'
import { canonicalize, manifestHash, type PassportManifest } from './passport.js'

/**
 * ## A standards-shaped signature over the passport manifest
 *
 * The on-chain anchor is `keccak256(canonical manifest)`. That proves *what* the
 * manifest says, but only to someone who can read 0G Chain. This module wraps the
 * same canonical bytes in a DSSE envelope carrying an in-toto Statement — the
 * envelope and statement format the OpenSSF Model Signing project builds on — so
 * a verifier needs no 0G RPC at all: just the envelope and a public key.
 *
 * What this is, precisely:
 *  - DSSE v1 pre-authentication encoding, an ed25519 signature, and an in-toto
 *    Statement v1 whose subject is the manifest's sha256 (the digest algorithm
 *    in-toto tooling expects) with the keccak256 anchor carried in the predicate.
 *  - The signature proves "the holder of this key signed this manifest". It says
 *    nothing about whether training was honest — Crucible proves lineage, not
 *    honest training.
 *
 * What this is NOT: a Sigstore bundle (no certificate chain, no transparency log)
 * and it has not been run through the `model-signing` CLI. Interop with that tool
 * is unverified and must not be claimed until it has been.
 */

export const DSSE_PAYLOAD_TYPE = 'application/vnd.in-toto+json'
export const STATEMENT_TYPE = 'https://in-toto.io/Statement/v1'
export const PREDICATE_TYPE = 'https://crucible.0g/passport-lineage/v1'

export interface DsseSignature {
  /** Free-form key hint; here the sha256 of the SPKI public key, hex. */
  keyid: string
  /** base64 ed25519 signature over the PAE of payloadType + payload. */
  sig: string
}

export interface DsseEnvelope {
  payloadType: string
  /** base64 of the in-toto Statement JSON. */
  payload: string
  signatures: DsseSignature[]
}

export interface PassportStatement {
  _type: typeof STATEMENT_TYPE
  subject: { name: string; digest: { sha256: string } }[]
  predicateType: typeof PREDICATE_TYPE
  predicate: {
    /** The on-chain anchor — keccak256 of the same canonical bytes. */
    manifestKeccak256: string
    canonicalization: 'crucible-sorted-json-v1'
    manifest: PassportManifest
  }
}

export interface SigningKeyPair {
  /** PKCS8 PEM. Keep private. */
  privateKeyPem: string
  /** SPKI PEM. Publish. */
  publicKeyPem: string
}

/** Generate a fresh ed25519 key pair. */
export function generateSigningKey(): SigningKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  }
}

/** DSSE pre-authentication encoding: `DSSEv1 <len(type)> <type> <len(body)> <body>`. */
export function pae(payloadType: string, payload: Uint8Array): Buffer {
  const type = Buffer.from(payloadType, 'utf8')
  return Buffer.concat([
    Buffer.from(`DSSEv1 ${type.length} `, 'utf8'),
    type,
    Buffer.from(` ${payload.length} `, 'utf8'),
    Buffer.from(payload),
  ])
}

const sha256Hex = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex')

function keyIdOf(publicKeyPem: string): string {
  const der = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' })
  return sha256Hex(der)
}

/** Build the in-toto Statement for a manifest. */
export function buildStatement(manifest: PassportManifest, subjectName = 'crucible-passport'): PassportStatement {
  return {
    _type: STATEMENT_TYPE,
    subject: [{ name: subjectName, digest: { sha256: sha256Hex(canonicalize(manifest)) } }],
    predicateType: PREDICATE_TYPE,
    predicate: {
      manifestKeccak256: manifestHash(manifest),
      canonicalization: 'crucible-sorted-json-v1',
      manifest,
    },
  }
}

/** Sign a manifest, producing a DSSE envelope. */
export function signManifest(
  manifest: PassportManifest,
  privateKeyPem: string,
  publicKeyPem: string,
): DsseEnvelope {
  const payload = Buffer.from(JSON.stringify(buildStatement(manifest)), 'utf8')
  const signature = sign(null, pae(DSSE_PAYLOAD_TYPE, payload), createPrivateKey(privateKeyPem))
  return {
    payloadType: DSSE_PAYLOAD_TYPE,
    payload: payload.toString('base64'),
    signatures: [{ keyid: keyIdOf(publicKeyPem), sig: signature.toString('base64') }],
  }
}

export interface EnvelopeVerification {
  ok: boolean
  /** Why it failed, when `ok` is false. */
  reason?: string
  statement?: PassportStatement
}

/**
 * Verify an envelope against a public key and, optionally, the on-chain anchor.
 * Never throws: a malformed envelope is a failed verification.
 *
 * Passing `expectedKeccak256` binds the signature to the chain: the statement's
 * manifest must re-hash to that value, so a signed-but-altered manifest is caught
 * even though its signature is valid.
 */
export function verifyEnvelope(
  envelope: DsseEnvelope,
  publicKeyPem: string,
  expectedKeccak256?: string,
): EnvelopeVerification {
  try {
    if (envelope.payloadType !== DSSE_PAYLOAD_TYPE) return { ok: false, reason: 'unexpected payloadType' }
    const payload = Buffer.from(envelope.payload, 'base64')
    const pub = createPublicKey(publicKeyPem)
    const keyid = keyIdOf(publicKeyPem)
    const candidate = envelope.signatures.find((s) => s.keyid === keyid)
    if (!candidate) return { ok: false, reason: 'no signature for this key' }
    const valid = verify(null, pae(envelope.payloadType, payload), pub, Buffer.from(candidate.sig, 'base64'))
    if (!valid) return { ok: false, reason: 'signature does not verify' }

    const statement = JSON.parse(payload.toString('utf8')) as PassportStatement
    if (statement._type !== STATEMENT_TYPE || statement.predicateType !== PREDICATE_TYPE) {
      return { ok: false, reason: 'unexpected statement type' }
    }
    const recomputed = manifestHash(statement.predicate.manifest)
    if (recomputed.toLowerCase() !== statement.predicate.manifestKeccak256.toLowerCase()) {
      return { ok: false, reason: 'manifest does not match its own keccak256' }
    }
    if (sha256Hex(canonicalize(statement.predicate.manifest)) !== statement.subject[0]?.digest.sha256) {
      return { ok: false, reason: 'manifest does not match the subject digest' }
    }
    if (expectedKeccak256 && recomputed.toLowerCase() !== expectedKeccak256.trim().toLowerCase()) {
      return { ok: false, reason: 'manifest does not match the on-chain anchor' }
    }
    return { ok: true, statement }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'malformed envelope' }
  }
}
