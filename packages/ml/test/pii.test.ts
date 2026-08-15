import { describe, expect, it } from 'vitest'

import { detectPII, luhnCheck, redact } from '../src/analyze/pii.js'
import { normaliseRecords } from '../src/analyze/records.js'

const text = (t: string) => ({ text: t })
const scan = (t: string) => detectPII(normaliseRecords([text(t)]))

describe('luhnCheck', () => {
  // Industry test numbers — these are published, non-issued card numbers.
  it('accepts known-valid test card numbers', () => {
    expect(luhnCheck('4242424242424242')).toBe(true) // Visa test
    expect(luhnCheck('5555555555554444')).toBe(true) // Mastercard test
    expect(luhnCheck('378282246310005')).toBe(true) // Amex test
  })

  it('accepts a valid number with spaces or dashes', () => {
    expect(luhnCheck('4242 4242 4242 4242')).toBe(true)
    expect(luhnCheck('4242-4242-4242-4242')).toBe(true)
  })

  it('rejects a number one digit off', () => {
    expect(luhnCheck('4242424242424243')).toBe(false)
  })

  // This is the whole point of Luhn here: order IDs, timestamps and phone-ish
  // digit runs are everywhere in real datasets and must not be reported as cards.
  it('rejects ordinary digit strings that merely look card-shaped', () => {
    expect(luhnCheck('1234567890123456')).toBe(false)
    expect(luhnCheck('1111111111111111')).toBe(false)
    expect(luhnCheck('0000000000000001')).toBe(false)
    expect(luhnCheck('9999999999999999')).toBe(false)
  })

  it('rejects non-digit and empty input', () => {
    expect(luhnCheck('')).toBe(false)
    expect(luhnCheck('abcd')).toBe(false)
    expect(luhnCheck('42424242424242424242424242')).toBe(false) // too long for a card
    expect(luhnCheck('4242')).toBe(false) // too short
  })
})

describe('redact', () => {
  it('masks the middle and keeps a short recognisable head and tail', () => {
    const masked = redact('supersecretvalue')
    expect(masked).not.toBe('supersecretvalue')
    expect(masked).toContain('*')
  })

  it('never returns the original string for a short secret', () => {
    expect(redact('abcd')).not.toBe('abcd')
    expect(redact('a')).not.toBe('a')
  })

  it('does not grow without bound for a long secret', () => {
    expect(redact('x'.repeat(500)).length).toBeLessThanOrEqual(32)
  })
})

describe('detectPII — emails', () => {
  it('finds an email address and reports its line', () => {
    const findings = scan('Contact me at alice.smith@example.com for details')
    expect(findings).toHaveLength(1)
    expect(findings[0]!.type).toBe('email')
    expect(findings[0]!.line).toBe(1)
  })

  it('never echoes the full address back', () => {
    const findings = scan('Contact alice.smith@example.com now')
    expect(findings[0]!.sample).not.toContain('alice.smith@example.com')
    expect(JSON.stringify(findings)).not.toContain('alice.smith@example.com')
  })

  it('does not fire on ordinary prose containing an @', () => {
    expect(scan('meet me @ the cafe at noon')).toEqual([])
  })
})

describe('detectPII — phone numbers', () => {
  it('finds an international phone number', () => {
    const findings = scan('call +44 20 7946 0958 tomorrow')
    expect(findings.some((f) => f.type === 'phone')).toBe(true)
  })

  it('finds a dashed north-american number', () => {
    const findings = scan('reach us on 415-555-0132 any time')
    expect(findings.some((f) => f.type === 'phone')).toBe(true)
  })

  it('does not fire on a plain year or small number', () => {
    expect(scan('the year 2026 was notable and 42 is the answer')).toEqual([])
  })
})

describe('detectPII — credit cards', () => {
  it('reports a Luhn-valid card number', () => {
    const findings = scan('card 4242 4242 4242 4242 exp 12/29')
    expect(findings.some((f) => f.type === 'credit-card')).toBe(true)
  })

  it('does NOT report a card-shaped string that fails Luhn', () => {
    const findings = scan('order reference 1234567890123456 shipped')
    expect(findings.some((f) => f.type === 'credit-card')).toBe(false)
  })

  it('never echoes the full card number', () => {
    const findings = scan('card 4242424242424242')
    expect(JSON.stringify(findings)).not.toContain('4242424242424242')
  })
})

describe('detectPII — IP addresses', () => {
  it('finds an IPv4 address', () => {
    const findings = scan('server at 192.168.10.24 is down')
    expect(findings.some((f) => f.type === 'ip-address')).toBe(true)
  })

  it('does not fire on a version number', () => {
    const findings = scan('upgrade to version 1.2.3 today')
    expect(findings.some((f) => f.type === 'ip-address')).toBe(false)
  })

  it('does not fire on an out-of-range octet', () => {
    const findings = scan('the code 999.888.777.666 is not an address')
    expect(findings.some((f) => f.type === 'ip-address')).toBe(false)
  })
})

describe('detectPII — secrets', () => {
  it('finds an OpenAI-style API key', () => {
    const findings = scan('use sk-abcdefghij0123456789abcdefghij0123456789abcd for auth')
    expect(findings.some((f) => f.type === 'api-key')).toBe(true)
  })

  it('finds an AWS access key id', () => {
    const findings = scan('AKIAIOSFODNN7EXAMPLE is the key')
    expect(findings.some((f) => f.type === 'api-key')).toBe(true)
  })

  it('finds a GitHub token', () => {
    const findings = scan('token ghp_abcdefghijklmnopqrstuvwxyz0123456789 here')
    expect(findings.some((f) => f.type === 'api-key')).toBe(true)
  })

  it('finds a PEM private key header', () => {
    const findings = scan('-----BEGIN RSA PRIVATE KEY----- MIIEow…')
    expect(findings.some((f) => f.type === 'private-key')).toBe(true)
  })

  it('finds a hex-encoded private key of the kind 0G wallets use', () => {
    const findings = scan(`key 0x${'a1b2c3d4'.repeat(8)} do not commit`)
    expect(findings.some((f) => f.type === 'private-key')).toBe(true)
  })

  it('rates secrets as high severity and emails as lower', () => {
    const secret = scan('-----BEGIN RSA PRIVATE KEY-----')[0]!
    const email = scan('a@b.com')[0]!
    expect(secret.severity).toBe('high')
    expect(email.severity).not.toBe('high')
  })

  it('never echoes a full secret', () => {
    const key = `0x${'a1b2c3d4'.repeat(8)}`
    const findings = scan(`key ${key}`)
    expect(JSON.stringify(findings)).not.toContain(key)
  })
})

describe('detectPII — reporting', () => {
  it('reports findings across many lines with correct line numbers', () => {
    const records = normaliseRecords([
      text('nothing here'),
      text('email bob@example.org'),
      text('nothing here either'),
      text('server 10.0.0.1'),
    ])

    const findings = detectPII(records)

    expect(findings.map((f) => f.line).sort((a, b) => a - b)).toEqual([2, 4])
  })

  it('scans the answer side as well as the prompt side', () => {
    const records = normaliseRecords([
      {
        messages: [
          { role: 'user', content: 'what is my email?' },
          { role: 'assistant', content: 'it is carol@example.com' },
        ],
      },
    ])

    const findings = detectPII(records)
    expect(findings).toHaveLength(1)
    expect(findings[0]!.field).toBe('output')
  })

  it('reports several distinct findings on one line', () => {
    const findings = scan('email a@b.com and server 10.0.0.1')
    expect(findings).toHaveLength(2)
    expect(new Set(findings.map((f) => f.type)).size).toBe(2)
  })

  it('de-duplicates the same value repeated on one line', () => {
    const findings = scan('a@b.com and again a@b.com')
    expect(findings.filter((f) => f.type === 'email')).toHaveLength(1)
  })

  it('counts occurrences of a repeated value', () => {
    const findings = scan('a@b.com and again a@b.com')
    expect(findings[0]!.occurrences).toBe(2)
  })

  it('finds nothing in clean data', () => {
    const records = normaliseRecords([
      text('The capital of France is Paris'),
      text('Photosynthesis converts light to energy'),
    ])
    expect(detectPII(records)).toEqual([])
  })

  it('handles an empty dataset', () => {
    expect(detectPII([])).toEqual([])
  })
})
