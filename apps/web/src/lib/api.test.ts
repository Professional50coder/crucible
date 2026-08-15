import { beforeEach, describe, expect, it } from 'vitest'

import {
  MOCK_MODE,
  applyFilter,
  createJob,
  getJob,
  getJobLogs,
  getPassport,
  listJobs,
  listPassports,
  listProviders,
  parseRawLogs,
  toSummary,
  unlockJob,
} from './api'
import { buildPassports } from './mock/fixtures'
import { resetMockStore } from './mock/store'
import { DEFAULT_CONFIG } from './training-config'

beforeEach(() => {
  resetMockStore()
})

describe('mock mode', () => {
  it('is the default, so the app demos with no backend', () => {
    expect(MOCK_MODE).toBe(true)
  })
})

describe('listPassports', () => {
  it('returns fixture passports as summaries', async () => {
    const passports = await listPassports()
    expect(passports.length).toBeGreaterThan(0)
    expect(passports[0]).toHaveProperty('model')
    expect(passports[0]).toHaveProperty('totalNeuron')
  })

  it('sorts newest first', async () => {
    const passports = await listPassports()
    const dates = passports.map((p) => Date.parse(p.createdAt))
    expect([...dates].sort((a, b) => b - a)).toEqual(dates)
  })

  it('filters by network', async () => {
    const mainnet = await listPassports({ network: 'mainnet' })
    expect(mainnet.length).toBeGreaterThan(0)
    expect(mainnet.every((p) => p.network === 'mainnet')).toBe(true)
  })
})

describe('applyFilter', () => {
  const summaries = buildPassports().map(toSummary)

  it('returns everything when unfiltered', () => {
    expect(applyFilter(summaries)).toHaveLength(summaries.length)
  })

  it('filters by model', () => {
    const filtered = applyFilter(summaries, { model: 'Qwen3-32B' })
    expect(filtered.length).toBeGreaterThan(0)
    expect(filtered.every((p) => p.model === 'Qwen3-32B')).toBe(true)
  })

  it('searches name, summary, model and id case-insensitively', () => {
    const byName = applyFilter(summaries, { query: 'SUPPORT-TONE' })
    expect(byName.length).toBeGreaterThan(0)

    const byModel = applyFilter(summaries, { query: 'qwen3' })
    expect(byModel.every((p) => p.model.toLowerCase().includes('qwen3'))).toBe(true)
  })

  it('combines filters', () => {
    const filtered = applyFilter(summaries, { network: 'testnet', model: 'Qwen3-32B' })
    expect(filtered).toHaveLength(0)
  })

  it('returns an empty array rather than throwing on no match', () => {
    expect(applyFilter(summaries, { query: 'zzzzz-nothing' })).toEqual([])
  })
})

describe('getPassport', () => {
  it('returns a full record with manifest and mint', async () => {
    const record = await getPassport('p-4c1f9a')
    expect(record).not.toBeNull()
    expect(record!.manifest.base.model).toBe('Qwen2.5-0.5B-Instruct')
    expect(record!.mint.manifestRootHash).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('returns null for an unknown id rather than throwing', async () => {
    expect(await getPassport('p-does-not-exist')).toBeNull()
  })
})

describe('jobs', () => {
  it('seeds one job in every state the UI must handle', async () => {
    const jobs = await listJobs()
    const states = new Set(jobs.map((job) => job.state))

    expect(states.has('Delivered')).toBe(true)
    expect(states.has('Training')).toBe(true)
    expect(states.has('Finished')).toBe(true)
    expect(states.has('Failed')).toBe(true)
    expect(jobs.some((job) => job.queued)).toBe(true)
  })

  it('gives the failed job a remediation hint, not just an error code', async () => {
    const job = await getJob('job_9b0f77')
    expect(job!.error).toBe('MinimumDepositRequired')
    expect(job!.errorHint).toContain('--service fine-tuning')
  })

  it('arms the daemon on a delivered job', async () => {
    const job = await getJob('job_7f21c4')
    expect(job!.deliveredAt).not.toBeNull()
    expect(job!.acknowledgeScheduledFor).not.toBeNull()
    expect(job!.acknowledgedAt).toBeNull()

    const scheduled = Date.parse(job!.acknowledgeScheduledFor!)
    const deadline = Date.parse(job!.deliveredAt!) + 48 * 3600_000
    expect(scheduled).toBeLessThan(deadline)
  })

  it('returns null for an unknown job', async () => {
    expect(await getJob('job_nope')).toBeNull()
  })

  it('keeps logs and state consistent', async () => {
    const logs = await getJobLogs('job_7f21c4')
    expect(logs.length).toBeGreaterThan(0)
    expect(logs.map((l) => l.ts.length > 0)).not.toContain(false)

    const timestamps = logs.map((l) => Date.parse(l.ts))
    expect([...timestamps].sort((a, b) => a - b)).toEqual(timestamps)
  })
})

describe('createJob', () => {
  it('creates a job that appears in the list and starts at Init', async () => {
    const job = await createJob({
      network: 'mainnet',
      provider: '0x940b4a101CaBa9be04b16A7363cafa29C1660B0d',
      model: 'Qwen2.5-0.5B-Instruct',
      config: DEFAULT_CONFIG,
      name: 'test-run',
      dataset: { filename: 'x.jsonl', format: 'chat', exampleCount: 30, tokenCount: 9000 },
    })

    expect(job.state).toBe('Init')
    expect(job.name).toBe('test-run')
    expect(job.deliveredAt).toBeNull()

    const jobs = await listJobs()
    expect(jobs.some((j) => j.id === job.id)).toBe(true)
  })

  it('queues a job when the network’s single provider is already busy', async () => {
    // job_2ad901 is seeded mid-Training on mainnet.
    const job = await createJob({
      network: 'mainnet',
      provider: '0x940b4a101CaBa9be04b16A7363cafa29C1660B0d',
      model: 'Qwen2.5-0.5B-Instruct',
      config: DEFAULT_CONFIG,
    })

    expect(job.queued).toBe(true)
    expect(job.state).toBe('Init')
  })
})

describe('store persistence', () => {
  it('survives a reload, so a passport URL still resolves after one', async () => {
    // Without this, hard-loading the passport for a run you just watched finish
    // would say "not found" — the worst possible message on a provenance page.
    const job = await createJob({
      network: 'testnet',
      provider: '0xA02b95Aa6886b1116C4f334eDe00381511E31A09',
      model: 'Qwen2.5-0.5B-Instruct',
      config: DEFAULT_CONFIG,
      name: 'persisted-run',
    })

    // Simulate a reload: drop the in-memory store but keep sessionStorage.
    const saved = window.sessionStorage.getItem('crucible.mock.v1')
    expect(saved).not.toBeNull()

    resetMockStore()
    window.sessionStorage.setItem('crucible.mock.v1', saved!)

    const afterReload = await getJob(job.id)
    expect(afterReload).not.toBeNull()
    expect(afterReload!.name).toBe('persisted-run')
  })

  it('discards state older than the session window rather than resurrecting it', async () => {
    const stale = JSON.stringify({
      initialisedAt: Date.now() - 3 * 60 * 60 * 1000,
      jobs: [{ id: 'job_stale', name: 'stale' }],
      logs: [],
      passports: [],
      simulations: [],
    })

    resetMockStore()
    window.sessionStorage.setItem('crucible.mock.v1', stale)

    // An expired acknowledgement window from yesterday is worse than a reseed.
    expect(await getJob('job_stale')).toBeNull()
    expect(await getJob('job_7f21c4')).not.toBeNull()
  })

  it('reseeds rather than throwing when stored state is corrupt', async () => {
    resetMockStore()
    window.sessionStorage.setItem('crucible.mock.v1', '{not json')

    expect(await getJob('job_7f21c4')).not.toBeNull()
  })
})

describe('unlockJob', () => {
  it('returns a transaction hash for the Bug #4 escape hatch', async () => {
    const result = await unlockJob('job_9b0f77')
    expect(result.ok).toBe(true)
    expect(result.txHash).toMatch(/^0x[0-9a-f]{64}$/)
  })
})

describe('listProviders', () => {
  it('reports the verified live providers', async () => {
    const providers = await listProviders()
    expect(providers).toHaveLength(2)

    const mainnet = providers.find((p) => p.network === 'mainnet')!
    expect(mainnet.address).toBe('0x940b4a101CaBa9be04b16A7363cafa29C1660B0d')
    expect(mainnet.pricePerTokenNeuron).toBe('500000000000')
    expect(mainnet.teeSignerAcknowledged).toBe(true)
  })

  it('filters by network', async () => {
    const testnet = await listProviders('testnet')
    expect(testnet).toHaveLength(1)
    expect(testnet[0]!.address).toBe('0xA02b95Aa6886b1116C4f334eDe00381511E31A09')
  })
})

describe('parseRawLogs', () => {
  it('splits a raw provider log blob into levelled lines', () => {
    const raw = [
      '[2026-08-14T12:00:00Z] training started',
      '[2026-08-14T12:05:00Z] WARN provider occupied',
      '[2026-08-14T12:10:00Z] ERROR acknowledge failed',
      '',
    ].join('\n')

    const lines = parseRawLogs(raw)
    expect(lines).toHaveLength(3)
    expect(lines[0]!.level).toBe('info')
    expect(lines[1]!.level).toBe('warn')
    expect(lines[2]!.level).toBe('error')
    expect(lines[0]!.message).toBe('training started')
  })
})
