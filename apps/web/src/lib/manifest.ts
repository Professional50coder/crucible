/**
 * Canonical serialisation and hashing of a passport manifest.
 *
 * INTERFACES.md §1 states the rule and calls it the single most important
 * invariant in the system: `canonicalize(manifest)` must produce deterministic
 * JSON — keys sorted recursively, no whitespace — so that two manifests with
 * identical content serialise byte-identically regardless of key insertion
 * order. `manifestHash = keccak256(utf8Bytes(canonicalize(manifest)))`.
 *
 * The web app implements this itself for one reason: it lets the passport page
 * recompute the hash **in the reader's browser** and compare it against the
 * value anchored on 0G Chain. A verification you watch happen locally is worth
 * more than a verification a server asserts.
 *
 * `@crucible/core` owns the canonical implementation. If these two ever
 * disagree, core is right and this is a bug — the test suite pins the rule.
 */

import { keccak256, toBytes } from 'viem'

import type { PassportManifest, TrainingConfig } from './types'

/** Recursively key-sorted, whitespace-free JSON. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null'
  }

  if (Array.isArray(value)) {
    // Array order is meaningful and is preserved; only object keys are sorted.
    return `[${value.map(canonicalize).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>)
    // `undefined` has no JSON representation; dropping it keeps the output
    // identical whether an optional field is absent or explicitly undefined.
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`
}

/**
 * keccak256 of any canonicalised value, 0x-prefixed.
 *
 * Exposed generically because the document a passport's hash commits to is not
 * always this app's `PassportManifest`: a token minted before that shape settled
 * anchored a smaller record, and reproducing *its* hash means hashing *it*.
 */
export function canonicalHash(value: unknown): string {
  return keccak256(toBytes(canonicalize(value)))
}

/** keccak256 of the canonical manifest, 0x-prefixed. */
export function manifestHash(manifest: PassportManifest): string {
  return canonicalHash(manifest)
}

/** keccak256 of the canonical training config — `PassportData.configHash`. */
export function configHash(config: TrainingConfig): string {
  return canonicalHash(config)
}

/** keccak256 of a UTF-8 string, with no canonicalisation. */
export function hashUtf8(value: string): string {
  return keccak256(toBytes(value))
}

/** Readable form, for the "raw manifest" disclosure. */
export function prettyManifest(manifest: PassportManifest | Record<string, unknown>): string {
  return JSON.stringify(manifest, null, 2)
}
