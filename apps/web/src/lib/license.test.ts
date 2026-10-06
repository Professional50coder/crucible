import { describe, expect, it } from 'vitest'
import { hexToString } from 'viem'

import {
  MAX_PERMISSION_BYTES,
  decodePermissions,
  describePermissions,
  encodePermissions,
  explainLicenseError,
  parseExecutor,
  parsePermissionsJson,
  parseTokenId,
} from './license'

const ADDR = '0xA02b95Aa6886b1116C4f334eDe00381511E31A09'

describe('parseExecutor', () => {
  it('accepts a valid address and returns the checksummed form', () => {
    const result = parseExecutor(ADDR.toLowerCase())
    expect(result).toEqual({ ok: true, value: ADDR })
  })
  it('rejects empty, malformed and zero addresses', () => {
    expect(parseExecutor('  ').ok).toBe(false)
    expect(parseExecutor('0x123').ok).toBe(false)
    expect(parseExecutor('0x' + '0'.repeat(40)).ok).toBe(false)
  })
})

describe('parseTokenId', () => {
  it('accepts whole numbers only', () => {
    expect(parseTokenId('3')).toEqual({ ok: true, value: 3n })
    expect(parseTokenId('-1').ok).toBe(false)
    expect(parseTokenId('1.5').ok).toBe(false)
    expect(parseTokenId('').ok).toBe(false)
  })
})

describe('encodePermissions', () => {
  it('is deterministic whatever order the flags were set in', () => {
    const a = encodePermissions({ commercial: false, inference: true })
    const b = encodePermissions({ inference: true, commercial: false })
    expect(a).toBe(b)
    expect(hexToString(a)).toBe('{"inference":true,"commercial":false}')
  })
  it('omits flags that were never set', () => {
    expect(hexToString(encodePermissions({ inference: true }))).toBe('{"inference":true}')
  })
})

describe('parsePermissionsJson', () => {
  it('treats empty input as no permissions', () => {
    expect(parsePermissionsJson('')).toEqual({ ok: true, value: '0x' })
  })
  it('accepts an object of booleans', () => {
    expect(parsePermissionsJson('{"inference":true}').ok).toBe(true)
  })
  it('rejects bad JSON, arrays, and non-boolean values', () => {
    expect(parsePermissionsJson('{nope').ok).toBe(false)
    expect(parsePermissionsJson('[true]').ok).toBe(false)
    expect(parsePermissionsJson('{"inference":"yes"}')).toEqual({
      ok: false,
      error: '"inference" must be true or false.',
    })
  })
  it('rejects a blob over the size cap', () => {
    const big = JSON.stringify(
      Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`flag_number_${i}`, true])),
    )
    expect(big.length).toBeGreaterThan(MAX_PERMISSION_BYTES)
    expect(parsePermissionsJson(big).ok).toBe(false)
  })
})

describe('decodePermissions / describePermissions', () => {
  it('round-trips what encodePermissions wrote', () => {
    const decoded = decodePermissions(encodePermissions({ inference: true, commercial: false }))
    expect(decoded).toEqual({ kind: 'flags', flags: { inference: true, commercial: false } })
    expect(describePermissions(decoded)).toBe('Allowed: Run inference')
  })
  it('reads an empty blob as empty', () => {
    expect(decodePermissions('0x')).toEqual({ kind: 'empty' })
    expect(describePermissions({ kind: 'empty' })).toBe('No permissions recorded')
  })
  it('never guesses at a blob that is not our JSON', () => {
    const decoded = decodePermissions('0xdeadbeef')
    expect(decoded.kind).toBe('opaque')
    expect(describePermissions(decoded)).toMatch(/another tool/)
    expect(decodePermissions('0x5b315d').kind).toBe('opaque') // "[1]"
  })
  it('states plainly when every right is off', () => {
    const decoded = decodePermissions(encodePermissions({ inference: false }))
    expect(describePermissions(decoded)).toMatch(/switched off/)
  })
})

describe('explainLicenseError', () => {
  it('maps the contract custom errors to plain language', () => {
    expect(explainLicenseError(new Error('reverted: AlreadyAuthorized(1, 0x..)'))).toMatch(/already holds/)
    expect(explainLicenseError(new Error('NotTokenOwner(1, 0x..)'))).toMatch(/Only the passport owner/)
    expect(explainLicenseError(new Error('MaxAuthorizationsReached(1, 100)'))).toMatch(/maximum of 100/)
    expect(explainLicenseError(new Error('User rejected the request'))).toMatch(/cancelled/)
  })
  it('falls back without leaking raw internals', () => {
    expect(explainLicenseError(new Error('some rpc stack trace 0xabc'))).not.toMatch(/stack trace/)
  })
})
