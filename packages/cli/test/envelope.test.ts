import { describe, expect, test } from 'vitest'
import { STANDARD_TEMPLATE, buildManifest, manifestHash, type PassportInput } from '@crucible/core'
import { parseArgs } from '../src/cli.js'
import { keygenCommand, signCommand, verifyEnvelopeCommand } from '../src/commands.js'
import { plain } from '../src/format.js'

const text = (lines: string[]) => plain(lines.join('\n'))

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
const manifestJson = JSON.stringify(manifest)
const anchored = manifestHash(manifest)
const keys = keygenCommand()

const signed = () => {
  const r = signCommand(manifestJson, 'm.json', keys.privateKeyPem, keys.publicKeyPem)
  expect(r.code).toBe(0)
  return r.output as string
}

describe('keygenCommand', () => {
  test('returns a usable PEM pair and writes nothing itself', () => {
    expect(keys.privateKeyPem).toContain('PRIVATE KEY')
    expect(keys.publicKeyPem).toContain('PUBLIC KEY')
    expect(keygenCommand().privateKeyPem).not.toBe(keys.privateKeyPem)
  })
})

describe('signCommand + verifyEnvelopeCommand', () => {
  test('a signed envelope verifies offline and prints the anchor hash', () => {
    const r = verifyEnvelopeCommand(signed(), 'env.json', keys.publicKeyPem)
    expect(r.code).toBe(0)
    expect(text(r.lines)).toContain(anchored)
  })

  test('--expect passes against the real anchor and fails against a different one', () => {
    expect(verifyEnvelopeCommand(signed(), 'env.json', keys.publicKeyPem, anchored).code).toBe(0)
    const wrong = '0x' + '11'.repeat(32)
    const r = verifyEnvelopeCommand(signed(), 'env.json', keys.publicKeyPem, wrong)
    expect(r.code).toBe(1)
    expect(text(r.lines)).toContain('on-chain anchor')
  })

  test('the wrong public key fails', () => {
    const other = keygenCommand()
    expect(verifyEnvelopeCommand(signed(), 'env.json', other.publicKeyPem).code).toBe(1)
  })

  test('a tampered payload fails', () => {
    const env = JSON.parse(signed())
    const statement = JSON.parse(Buffer.from(env.payload, 'base64').toString())
    statement.predicate.manifest.dataset.exampleCount = 1
    env.payload = Buffer.from(JSON.stringify(statement)).toString('base64')
    const r = verifyEnvelopeCommand(JSON.stringify(env), 'env.json', keys.publicKeyPem)
    expect(r.code).toBe(1)
    expect(text(r.lines)).toContain('FAILED verification')
  })

  test('non-JSON input is a failure, not a crash', () => {
    expect(verifyEnvelopeCommand('not json', 'env.json', keys.publicKeyPem).code).toBe(1)
  })

  test('signing rejects something that is not a manifest', () => {
    expect(signCommand('not json', 'm.json', keys.privateKeyPem, keys.publicKeyPem).code).toBe(1)
  })
})

describe('parseArgs — signing commands', () => {
  test('keygen needs a directory', () => {
    expect(parseArgs(['keygen'])).toMatchObject({ kind: 'error' })
    expect(parseArgs(['keygen', 'keys'])).toEqual({ kind: 'keygen', dir: 'keys' })
  })

  test('sign needs both keys and takes an optional --out', () => {
    expect(parseArgs(['sign', 'm.json', '--key', 'k'])).toMatchObject({ kind: 'error' })
    expect(parseArgs(['sign', 'm.json', '--key', 'k', '--pub', 'p', '--out', 'e.json'])).toEqual({
      kind: 'sign',
      file: 'm.json',
      key: 'k',
      pub: 'p',
      out: 'e.json',
    })
  })

  test('verify-envelope needs --pub and takes an optional --expect', () => {
    expect(parseArgs(['verify-envelope', 'e.json'])).toMatchObject({ kind: 'error' })
    expect(parseArgs(['verify-envelope', 'e.json', '--pub', 'p', '--expect', '0xab'])).toEqual({
      kind: 'verify-envelope',
      file: 'e.json',
      pub: 'p',
      expect: '0xab',
    })
  })
})
