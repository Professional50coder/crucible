import { describe, expect, test } from 'vitest'
import {
  MODEL_CARD_TAGS,
  buildModelCard,
  hasSentinelAdapter,
  sentinelAdapterHash,
  yamlScalar,
} from '../src/modelcard.js'
import { type PassportInput, buildManifest, manifestHash } from '../src/passport.js'
import { STANDARD_TEMPLATE } from '../src/training-config.js'
import { NETWORKS } from '../src/networks.js'

const VALID_INPUT: PassportInput = {
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

const manifestWith = (patch: Partial<PassportInput> = {}) =>
  buildManifest({ ...VALID_INPUT, ...patch })

/**
 * A deliberately small YAML reader covering exactly the subset the card emits: `key: scalar`
 * and `key:` followed by an indented `- item` list. @crucible/core has no YAML dependency and
 * gains nothing from one, but "the front matter is valid YAML" is only a real assertion if
 * something actually parses it — so the reader is written to the spec, not to the emitter.
 */
function parseFrontMatter(card: string): Record<string, string | string[]> {
  const lines = card.split('\n')
  expect(lines[0]).toBe('---')

  const end = lines.indexOf('---', 1)
  expect(end).toBeGreaterThan(0)

  const unquote = (raw: string): string => {
    const value = raw.trim()
    if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
      return value.slice(1, -1).replace(/''/g, "'")
    }
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      return JSON.parse(value) as string
    }
    // Plain scalars: prove the emitter never leaves a bare value YAML would retype.
    expect(value).not.toMatch(/^(true|false|null|yes|no|on|off|~)$/i)
    expect(value).not.toMatch(/^[-+]?\d+(\.\d*)?$/)
    expect(value).not.toContain(': ')
    expect(value).not.toContain(' #')
    return value
  }

  const out: Record<string, string | string[]> = {}
  let listKey: string | null = null

  for (const line of lines.slice(1, end)) {
    const item = /^ {2}- (.*)$/.exec(line)
    if (item) {
      expect(listKey).not.toBeNull()
      ;(out[listKey as string] as string[]).push(unquote(item[1] as string))
      continue
    }

    const pair = /^([A-Za-z0-9_]+):(.*)$/.exec(line)
    expect(pair).not.toBeNull()

    const key = (pair as RegExpExecArray)[1] as string
    const rest = ((pair as RegExpExecArray)[2] as string).trim()

    if (rest === '') {
      listKey = key
      out[key] = []
    } else {
      listKey = null
      out[key] = unquote(rest)
    }
  }

  return out
}

const body = (card: string): string => card.slice(card.indexOf('---', 1) + 3)

describe('yamlScalar', () => {
  test('leaves ordinary identifiers plain', () => {
    expect(yamlScalar('apache-2.0')).toBe('apache-2.0')
    expect(yamlScalar('Qwen/Qwen2.5-0.5B-Instruct')).toBe('Qwen/Qwen2.5-0.5B-Instruct')
  })

  test('quotes anything a colon, hash or quote would otherwise break', () => {
    expect(yamlScalar('Model: the sequel')).toBe("'Model: the sequel'")
    expect(yamlScalar("O'Reilly weights")).toBe("'O''Reilly weights'")
    expect(yamlScalar('other # not a comment')).toBe("'other # not a comment'")
    expect(yamlScalar('- leading dash')).toBe("'- leading dash'")
    expect(yamlScalar('')).toBe("''")
  })

  test('quotes values YAML would retype as a boolean, null or number', () => {
    expect(yamlScalar('yes')).toBe("'yes'")
    expect(yamlScalar('null')).toBe("'null'")
    expect(yamlScalar('1.0')).toBe("'1.0'")
  })

  test('double-quotes control characters, which single quotes cannot hold', () => {
    expect(yamlScalar('two\nlines')).toBe('"two\\nlines"')
  })
})

describe('buildModelCard front matter', () => {
  test('parses as YAML and carries the Hub lineage keys', () => {
    const front = parseFrontMatter(buildModelCard(manifestWith(), { license: 'apache-2.0' }))

    expect(Object.keys(front)).toEqual(['base_model', 'base_model_relation', 'license', 'tags'])
    expect(front['license']).toBe('apache-2.0')
    expect(front['tags']).toEqual([...MODEL_CARD_TAGS])
  })

  test('declares the relation as adapter — a LoRA is not a finetune', () => {
    const card = buildModelCard(manifestWith())

    expect(parseFrontMatter(card)['base_model_relation']).toBe('adapter')
    expect(card).not.toContain('base_model_relation: finetune')
  })

  test('writes base_model as a Hub repo id, which is the only form the Hub resolves', () => {
    // `base.model` is 0G's own name and carries no owner prefix; `base.tokenizer` does.
    expect(parseFrontMatter(buildModelCard(manifestWith()))['base_model']).toBe(
      'Qwen/Qwen2.5-0.5B-Instruct',
    )
  })

  test('falls back to the 0G model name when no repo id is available', () => {
    const manifest = manifestWith({
      base: { ...VALID_INPUT.base, tokenizer: 'Qwen2.5-0.5B-Instruct' },
    })

    expect(parseFrontMatter(buildModelCard(manifest))['base_model']).toBe('Qwen2.5-0.5B-Instruct')
  })

  test('omits license entirely when the caller supplies none', () => {
    expect('license' in parseFrontMatter(buildModelCard(manifestWith()))).toBe(false)
  })

  test('survives a model name and licence containing a colon and a quote', () => {
    const manifest = manifestWith({
      base: { ...VALID_INPUT.base, tokenizer: "acme/Model: O'Reilly # v2" },
    })
    const front = parseFrontMatter(buildModelCard(manifest, { license: "other: O'Reilly" }))

    expect(front['base_model']).toBe("acme/Model: O'Reilly # v2")
    expect(front['license']).toBe("other: O'Reilly")
    // The keys below the awkward value must still be there — a broken quote eats them.
    expect(front['tags']).toEqual([...MODEL_CARD_TAGS])
  })

  test('appends caller tags without duplicating the defaults', () => {
    const front = parseFrontMatter(buildModelCard(manifestWith(), { tags: ['crucible', 'qwen2'] }))

    expect(front['tags']).toEqual([...MODEL_CARD_TAGS, 'qwen2'])
  })
})

describe('buildModelCard body', () => {
  test('states the run, dataset, config, fee, TEE signer and manifest hash', () => {
    const manifest = manifestWith()
    const card = buildModelCard(manifest)

    expect(card).toContain(manifest.task.id)
    expect(card).toContain(manifest.dataset.rootHash)
    expect(card).toContain('`learning_rate`')
    expect(card).toContain('0.0002')
    expect(card).toContain('0.05096 0G')
    expect(card).toContain(manifest.tee.signerAddress)
    expect(card).toContain(manifestHash(manifest))
    expect(card).toContain(NETWORKS.testnet.explorerUrl)
  })

  test('always says Crucible proves lineage, not honest training', () => {
    const variants = [
      manifestWith(),
      manifestWith({ tee: { ...VALID_INPUT.tee, attestationVerified: false } }),
      manifestWith({ adapter: { rootHash: 'sentinel' } }),
      manifestWith({ network: 'mainnet' }),
    ]

    for (const manifest of variants) {
      expect(buildModelCard(manifest)).toContain(
        '**Crucible proves lineage, not honest training.**',
      )
    }
  })

  test('never claims a production network for a testnet run', () => {
    const card = buildModelCard(manifestWith(), { license: 'apache-2.0' })

    expect(card.toLowerCase()).not.toContain('mainnet')
    expect(card).toContain('0G Galileo testnet (chain ID 16602)')
  })

  test('tells a reader how to recompute the hash themselves', () => {
    const card = buildModelCard(manifestWith())

    expect(card).toContain('## Verify it yourself')
    expect(card).toContain('keccak256')
    expect(card).toContain('Sort its object keys recursively')
    expect(body(card)).toContain('Storage Scan')
  })
})

describe('buildModelCard honesty', () => {
  test('says the attestation was NOT verified, and why, when it was not', () => {
    const card = buildModelCard(
      manifestWith({ tee: { ...VALID_INPUT.tee, attestationVerified: false } }),
    )

    expect(card).toContain('**NOT verified.**')
    expect(card).toContain('verifyService()')
    expect(card).not.toContain('**was verified**')
  })

  test('changes wording — and never implies a check that happened — when it was verified', () => {
    const card = buildModelCard(manifestWith())

    expect(card).toContain('**was verified**')
    expect(card).not.toContain('NOT verified')
  })

  test('calls out a sentinel adapter hash rather than presenting it as a locator', () => {
    const sentinel = sentinelAdapterHash(VALID_INPUT.task.id)
    const card = buildModelCard(manifestWith({ adapter: { rootHash: sentinel } }))

    expect(card).toContain('**No adapter file was ever retrieved.**')
    expect(card).toContain('crucible:adapter-not-retrieved:<taskId>')
    // No "look it up" link for a hash that resolves to nothing.
    expect(card).not.toContain(`rootHash=${sentinel}`)
  })

  test('treats the literal string "sentinel" the same way the mint script does', () => {
    expect(buildModelCard(manifestWith({ adapter: { rootHash: 'sentinel' } }))).toContain(
      '**No adapter file was ever retrieved.**',
    )
  })

  test('links a real adapter hash to Storage Scan instead', () => {
    const card = buildModelCard(manifestWith())

    expect(card).not.toContain('No adapter file was ever retrieved')
    expect(card).toContain(`rootHash=${VALID_INPUT.adapter.rootHash}`)
    expect(card).toContain('8400000 bytes')
  })
})

describe('sentinelAdapterHash', () => {
  test('reproduces the value contracts/scripts/mint.js computes for the same task ID', () => {
    // keccak256(toUtf8Bytes('crucible:adapter-not-retrieved:0x7f3a9c1e'))
    expect(sentinelAdapterHash('0x7f3a9c1e')).toMatch(/^0x[0-9a-f]{64}$/)
    expect(sentinelAdapterHash('0x7f3a9c1e')).not.toBe(sentinelAdapterHash('0x7f3a9c1f'))
  })

  test('is task-specific — a sentinel from another run does not read as one here', () => {
    expect(hasSentinelAdapter(manifestWith({ adapter: { rootHash: sentinelAdapterHash('0x1') } })))
      .toBe(false)
  })
})

describe('buildModelCard on-chain links', () => {
  test('links the passport token and mint transaction once it is minted', () => {
    const card = buildModelCard(manifestWith(), {
      mint: { contract: '0xCafe00000000000000000000000000000000BEEF', tokenId: 1, txHash: '0xabc' },
    })

    expect(card).toContain('## On chain')
    expect(card).toContain(
      `${NETWORKS.testnet.explorerUrl}/token/0xCafe00000000000000000000000000000000BEEF?a=1`,
    )
    expect(card).toContain(`${NETWORKS.testnet.explorerUrl}/tx/0xabc`)
  })

  test('emits no token or transaction link when the passport is not minted', () => {
    const card = buildModelCard(manifestWith())

    expect(card).not.toContain('## On chain')
    expect(card).not.toContain('/token/')
    expect(card).not.toContain('/tx/')
  })

  test('omits the transaction link when only the token is known', () => {
    const card = buildModelCard(manifestWith(), {
      mint: { contract: '0xCafe00000000000000000000000000000000BEEF', tokenId: '7' },
    })

    expect(card).toContain('?a=7')
    expect(card).not.toContain('/tx/')
  })
})
