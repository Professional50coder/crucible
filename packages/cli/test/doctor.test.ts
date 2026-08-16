import { describe, expect, test } from 'vitest'
import { networkFor } from '@crucible/core'
import {
  REFERENCE_TOKEN_COUNT,
  cheapestFree,
  costSection,
  doctor,
  inspectNetwork,
  providerSection,
  toProviderInfo,
  verdict,
  walletSection,
  type DoctorDeps,
  type ProviderInfo,
} from '../src/doctor.js'
import { plain } from '../src/format.js'

// Live values read from the network on 2026-08-14 (see docs/FIELD_NOTES.md).
const TESTNET_PRICE_PER_TOKEN = 800_000_000_000n

const provider = (over: Partial<ProviderInfo> = {}): ProviderInfo => ({
  provider: '0xf07240Efa67755B5311bc75784a061eDB47165Dd',
  url: 'http://example.invalid',
  quota: ['8', '32', '1', '100', 'H100'],
  pricePerToken: TESTNET_PRICE_PER_TOKEN,
  occupied: false,
  teeSignerAcknowledged: true,
  ...over,
})

/** No network anywhere in this file — docs/INTERFACES.md:270. */
const fakeBroker = (services: Record<string, unknown>[]) => ({
  fineTuning: { listService: async () => services },
})

const testnet = networkFor('testnet')

describe('toProviderInfo', () => {
  test('coerces struct output, keeping pricePerToken exact', () => {
    const [p] = toProviderInfo([
      {
        provider: '0xabc',
        url: 'http://x',
        quota: [8n, 32n, 1n, 100n, 'H100'],
        pricePerToken: '800000000000',
        occupied: false,
        teeSignerAcknowledged: true,
      },
    ])

    expect(p?.pricePerToken).toBe(800_000_000_000n)
    // bigints from ethers must survive as strings, not become "8n".
    expect(p?.quota).toEqual(['8', '32', '1', '100', 'H100'])
  })
})

describe('inspectNetwork', () => {
  test('reads services through the injected broker', async () => {
    const providers = await inspectNetwork(testnet, async () =>
      fakeBroker([
        {
          provider: '0xabc',
          url: 'http://x',
          quota: ['8', '32', '1', '100', 'H100'],
          pricePerToken: '800000000000',
          occupied: true,
          teeSignerAcknowledged: false,
        },
      ]),
    )

    expect(providers).toHaveLength(1)
    expect(providers[0]?.occupied).toBe(true)
  })
})

describe('cheapestFree', () => {
  test('ignores occupied providers even when they are cheaper', () => {
    const cheap = provider({ provider: '0xcheap', pricePerToken: 1n, occupied: true })
    const free = provider({ provider: '0xfree', pricePerToken: 900n })

    expect(cheapestFree([cheap, free])?.provider).toBe('0xfree')
  })

  test('returns undefined when everything is busy', () => {
    expect(cheapestFree([provider({ occupied: true })])).toBeUndefined()
  })
})

describe('providerSection', () => {
  test('an empty registry is a problem, not an empty list', () => {
    const s = providerSection([], testnet)
    expect(s.problems).toBe(1)
    expect(plain(s.lines.join('\n'))).toContain('no fine-tuning providers registered')
  })

  test('a busy provider counts as a problem and says tasks queue', () => {
    const s = providerSection([provider({ occupied: true })], testnet)
    expect(s.problems).toBe(1)
    expect(plain(s.lines.join('\n'))).toContain('queue one at a time')
  })

  test('a free acknowledged provider is not a problem', () => {
    const s = providerSection([provider()], testnet)
    expect(s.problems).toBe(0)
    const text = plain(s.lines.join('\n'))
    expect(text).toContain('AVAILABLE')
    expect(text).toContain('signer acknowledged on-chain')
    // 800000000000 neuron/token x 1e6 = 0.8 0G per million.
    expect(text).toContain('0.8 0G per 1M tokens')
  })

  test('an unacknowledged TEE signer is reported', () => {
    const s = providerSection([provider({ teeSignerAcknowledged: false })], testnet)
    expect(plain(s.lines.join('\n'))).toContain('NOT acknowledged')
  })
})

describe('costSection', () => {
  test('a reference count is labelled as 0G docs, not the user data', () => {
    const text = plain(
      costSection([provider()], testnet, {
        kind: 'reference',
        tokens: REFERENCE_TOKEN_COUNT,
      }).lines.join('\n'),
    )

    expect(text).toContain('REFERENCE COST')
    expect(text).toContain('NOT your data')
    expect(text).toContain('--dataset')
    // The old header called this an estimate. It never was one.
    expect(text).not.toContain('ESTIMATED COST')
  })

  test('a counted dataset is labelled an estimate and names the approximation', () => {
    const text = plain(
      costSection([provider()], testnet, {
        kind: 'estimated',
        tokens: 1234,
        records: 12,
        label: 'mine.jsonl',
      }).lines.join('\n'),
    )

    expect(text).toContain('ESTIMATED COST')
    expect(text).toContain('~1,234 tokens')
    expect(text).toContain('mine.jsonl')
    expect(text).toContain('~4-chars-per-token')
    expect(text).toContain('calculateToken')
  })

  test('prices every model the network offers', () => {
    const s = costSection([provider()], testnet, { kind: 'reference', tokens: 10_000 })
    for (const model of testnet.models) {
      expect(plain(s.lines.join('\n'))).toContain(model)
    }
  })

  test('says it cannot price a run when no provider is free', () => {
    const s = costSection([provider({ occupied: true })], testnet, {
      kind: 'reference',
      tokens: 10_000,
    })
    expect(plain(s.lines.join('\n'))).toContain('cannot price a run')
  })
})

describe('walletSection', () => {
  const eth = (v: bigint) => (Number(v) / 1e18).toString()

  test('a missing key warns without failing discovery', () => {
    const s = walletSection(undefined, undefined, eth)
    expect(s.problems).toBe(1)
    expect(plain(s.lines[0] ?? '')).toContain('PRIVATE_KEY not set')
  })

  test('an empty wallet points at the faucet', () => {
    const s = walletSection({ address: '0xabc', balance: 0n }, undefined, eth)
    expect(s.problems).toBe(1)
    expect(plain(s.lines.join('\n'))).toContain('faucet.0g.ai')
  })

  test('below 3 0G warns about the ledger minimum', () => {
    const s = walletSection({ address: '0xabc', balance: 10n ** 18n }, undefined, eth)
    expect(s.problems).toBe(1)
    expect(plain(s.lines.join('\n'))).toContain('create a ledger')
  })

  test('3 0G or more is clean', () => {
    const s = walletSection({ address: '0xabc', balance: 3n * 10n ** 18n }, undefined, eth)
    expect(s.problems).toBe(0)
    expect(plain(s.lines.join('\n'))).toContain('funded enough')
  })

  test('an RPC failure is reported as one problem, not a crash', () => {
    const s = walletSection(undefined, 'connection refused', eth)
    expect(s.problems).toBe(1)
    expect(plain(s.lines.join('\n'))).toContain('connection refused')
  })
})

describe('verdict', () => {
  test('pluralises and reports readiness', () => {
    expect(plain(verdict(0))).toContain('ready to train')
    expect(plain(verdict(1))).toContain('1 thing to resolve')
    expect(plain(verdict(2))).toContain('2 things to resolve')
  })
})

describe('doctor', () => {
  const deps = (over: Partial<DoctorDeps> = {}): { deps: DoctorDeps; out: string[] } => {
    const out: string[] = []
    return {
      out,
      deps: {
        createBroker: async () =>
          fakeBroker([
            {
              provider: '0xabc',
              url: 'http://x',
              quota: ['8', '32', '1', '100', 'H100'],
              pricePerToken: '800000000000',
              occupied: false,
              teeSignerAcknowledged: true,
            },
          ]),
        readWallet: async () => ({ address: '0xabc', balance: 5n * 10n ** 18n }),
        formatEther: (v) => (Number(v) / 1e18).toString(),
        log: (line) => out.push(line),
        ...over,
      },
    }
  }

  test('a healthy network exits 0 and reports ready', async () => {
    const { deps: d, out } = deps()
    const code = await doctor(networkFor('testnet'), { kind: 'reference', tokens: 10_000 }, d)

    expect(code).toBe(0)
    expect(plain(out.join('\n'))).toContain('ready to train')
  })

  test('an unreachable RPC exits 1 and names the endpoint', async () => {
    const { deps: d, out } = deps({
      createBroker: async () => {
        throw new Error('ECONNREFUSED')
      },
    })

    const code = await doctor(networkFor('testnet'), { kind: 'reference', tokens: 10_000 }, d)

    expect(code).toBe(1)
    const text = plain(out.join('\n'))
    expect(text).toContain('could not reach')
    expect(text).toContain('ECONNREFUSED')
    // Nothing downstream should have printed a cost off data it never got.
    expect(text).not.toContain('COST')
  })

  test('problems are counted across sections, not per section', async () => {
    const { deps: d, out } = deps({
      createBroker: async () =>
        fakeBroker([
          {
            provider: '0xabc',
            url: 'http://x',
            quota: ['8', '32', '1', '100', 'H100'],
            pricePerToken: '800000000000',
            occupied: true,
            teeSignerAcknowledged: true,
          },
        ]),
      readWallet: async () => undefined,
    })

    await doctor(networkFor('testnet'), { kind: 'reference', tokens: 10_000 }, d)
    expect(plain(out.join('\n'))).toContain('2 things to resolve')
  })

  test('a wallet lookup that throws does not abort the run', async () => {
    const { deps: d, out } = deps({
      readWallet: async () => {
        throw new Error('bad private key')
      },
    })

    const code = await doctor(networkFor('testnet'), { kind: 'reference', tokens: 10_000 }, d)
    expect(code).toBe(0)
    expect(plain(out.join('\n'))).toContain('bad private key')
  })
})
