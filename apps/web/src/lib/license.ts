/**
 * Usage licensing — the codec between what a person types and what
 * `Passport.authorizeUsage` stores.
 *
 * The contract stores `permissions` verbatim as opaque bytes and never
 * interprets them; their meaning belongs to whoever runs the model. This module
 * fixes one convention for this app: UTF-8 JSON, an object of boolean flags
 * (`{"inference":true,"commercial":false}`). Anything else is rejected before a
 * transaction is signed, because a malformed blob cannot be fixed afterwards
 * without revoking and re-granting.
 */

import { getAddress, isAddress, stringToHex, hexToString, type Hex } from 'viem'

/** The rights this page offers, and what each one means to an executor. */
export const PERMISSION_FLAGS = [
  { key: 'inference', label: 'Run inference', hint: 'May call the model and return outputs.' },
  { key: 'commercial', label: 'Commercial use', hint: 'May use outputs in a paid product.' },
  { key: 'fineTune', label: 'Further fine-tune', hint: 'May use the adapter as a training base.' },
] as const

export type PermissionKey = (typeof PERMISSION_FLAGS)[number]['key']
export type Permissions = Partial<Record<PermissionKey, boolean>>

/** Hard cap on the blob, so a grant cannot be made expensive by accident. */
export const MAX_PERMISSION_BYTES = 512

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

/** Validate an executor address, returning its checksummed form. */
export function parseExecutor(input: string): Parsed<`0x${string}`> {
  const trimmed = input.trim()
  if (trimmed === '') return { ok: false, error: 'Enter the executor address.' }
  if (!isAddress(trimmed, { strict: false })) {
    return { ok: false, error: 'That is not a valid 0x address.' }
  }
  const checksummed = getAddress(trimmed)
  if (/^0x0{40}$/.test(checksummed)) {
    return { ok: false, error: 'The zero address cannot hold usage rights.' }
  }
  return { ok: true, value: checksummed }
}

/** Parse a token id, a non-negative whole number. */
export function parseTokenId(input: string): Parsed<bigint> {
  const trimmed = input.trim()
  if (!/^\d+$/.test(trimmed)) return { ok: false, error: 'Token id must be a whole number.' }
  return { ok: true, value: BigInt(trimmed) }
}

/**
 * Encode permission flags as the bytes `authorizeUsage` takes. Only flags that
 * are explicitly set are written; keys are emitted in a fixed order so the same
 * grant always produces the same bytes.
 */
export function encodePermissions(flags: Permissions): Hex {
  const ordered: Record<string, boolean> = {}
  for (const { key } of PERMISSION_FLAGS) {
    if (typeof flags[key] === 'boolean') ordered[key] = flags[key] as boolean
  }
  return stringToHex(JSON.stringify(ordered))
}

/** Parse free-form JSON typed by a person into validated, encoded permissions. */
export function parsePermissionsJson(input: string): Parsed<Hex> {
  const trimmed = input.trim()
  if (trimmed === '') return { ok: true, value: '0x' }

  let data: unknown
  try {
    data = JSON.parse(trimmed)
  } catch {
    return { ok: false, error: 'Permissions must be valid JSON.' }
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, error: 'Permissions must be a JSON object of true/false flags.' }
  }
  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== 'boolean') {
      return { ok: false, error: `"${key}" must be true or false.` }
    }
  }
  const hex = stringToHex(JSON.stringify(data))
  if ((hex.length - 2) / 2 > MAX_PERMISSION_BYTES) {
    return { ok: false, error: `Permissions are larger than ${MAX_PERMISSION_BYTES} bytes.` }
  }
  return { ok: true, value: hex }
}

export type DecodedPermissions =
  | { kind: 'empty' }
  | { kind: 'flags'; flags: Record<string, boolean> }
  | { kind: 'opaque'; hex: Hex }

/**
 * Read a stored blob back. The contract accepts any bytes, so a grant made by
 * another tool may not be our JSON; that is shown as opaque, never guessed at.
 */
export function decodePermissions(hex: Hex): DecodedPermissions {
  if (hex === '0x' || hex === '0x0') return { kind: 'empty' }
  try {
    const parsed: unknown = JSON.parse(hexToString(hex))
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const entries = Object.entries(parsed)
      if (entries.every(([, value]) => typeof value === 'boolean')) {
        return { kind: 'flags', flags: Object.fromEntries(entries) as Record<string, boolean> }
      }
    }
  } catch {
    /* not our format — fall through to opaque */
  }
  return { kind: 'opaque', hex }
}

/** One plain-language line for a decoded grant. */
export function describePermissions(decoded: DecodedPermissions): string {
  if (decoded.kind === 'empty') return 'No permissions recorded'
  if (decoded.kind === 'opaque') return 'Custom permissions set by another tool'
  const labelOf = (key: string) => PERMISSION_FLAGS.find((flag) => flag.key === key)?.label ?? key
  const allowed = Object.entries(decoded.flags).filter(([, on]) => on).map(([key]) => labelOf(key))
  return allowed.length > 0 ? `Allowed: ${allowed.join(', ')}` : 'Granted with every right switched off'
}

/**
 * Turn a contract revert into something a person can act on. Matches on the
 * custom error names declared in `Passport.sol`.
 */
export function explainLicenseError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/AlreadyAuthorized/.test(message)) return 'That address already holds rights. Revoke first to change them.'
  if (/NotAuthorized/.test(message)) return 'That address does not hold rights on this passport.'
  if (/MaxAuthorizationsReached/.test(message)) return 'This passport already has the maximum of 100 executors.'
  if (/ZeroExecutor/.test(message)) return 'The zero address cannot hold usage rights.'
  if (/NonexistentPassport/.test(message)) return 'No passport exists with that token id.'
  if (/NotTokenOwner/.test(message)) return 'Only the passport owner can change usage rights.'
  if (/User rejected|denied/i.test(message)) return 'The request was cancelled in the wallet.'
  return 'The transaction could not be sent. Check the network and try again.'
}
