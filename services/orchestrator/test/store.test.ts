import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, appendFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openJobStore, type JobStore } from '../src/store.js'
import { ManualClock } from '../src/clock.js'

let dir: string
let file: string
let clock: ManualClock
let store: JobStore

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crucible-store-'))
  file = join(dir, 'jobs.ndjson')
  clock = new ManualClock(1_000_000)
  store = openJobStore({ path: file, clock })
})

afterEach(() => {
  store?.close()
  rmSync(dir, { recursive: true, force: true })
})

const input = {
  network: 'testnet' as const,
  provider: '0xA02b95Aa6886b1116C4f334eDe00381511E31A09',
  model: 'Qwen2.5-0.5B-Instruct',
  datasetRootHash: '0xdeadbeef',
}

describe('job store', () => {
  it('creates a job at Init with an id and timestamps', () => {
    const job = store.create(input)
    expect(job.id).toMatch(/\S/)
    expect(job.state).toBe('Init')
    expect(job.createdAt).toBe(1_000_000)
    expect(job.updatedAt).toBe(1_000_000)
    expect(job.ackAttempts).toBe(0)
    expect(job.provider).toBe(input.provider)
    expect(job.datasetRootHash).toBe('0xdeadbeef')
    expect(job.transitions).toEqual([{ state: 'Init', at: 1_000_000 }])
  })

  it('gives every job a distinct id', () => {
    const ids = new Set([store.create(input).id, store.create(input).id, store.create(input).id])
    expect(ids.size).toBe(3)
  })

  it('gets and lists jobs', () => {
    const a = store.create(input)
    const b = store.create(input)
    expect(store.get(a.id)?.id).toBe(a.id)
    expect(store.list().map((j) => j.id).sort()).toEqual([a.id, b.id].sort())
    expect(store.get('nope')).toBeUndefined()
  })

  it('updates merge a patch and bump updatedAt', () => {
    const a = store.create(input)
    clock.advance(5_000)
    const updated = store.update(a.id, { taskId: '0xabc', adapterPath: './models/a' })
    expect(updated.taskId).toBe('0xabc')
    expect(updated.adapterPath).toBe('./models/a')
    expect(updated.updatedAt).toBe(1_005_000)
    expect(updated.createdAt).toBe(1_000_000)
  })

  it('rejects an update to an unknown job', () => {
    expect(() => store.update('ghost', { taskId: 'x' })).toThrow(/ghost/)
  })

  it('returns copies, so a caller cannot mutate stored state by accident', () => {
    const a = store.create(input)
    const fetched = store.get(a.id)!
    fetched.state = 'Finished'
    expect(store.get(a.id)!.state).toBe('Init')
  })

  // THE test this whole module exists for.
  it('survives a process restart with no lost jobs and no lost schedule', () => {
    const a = store.create(input)
    store.update(a.id, {
      taskId: '0xtask',
      state: 'Delivered',
      deliveredAt: 1_000_000,
      scheduledAckAt: 1_000_000 + 3_600_000,
      ackAttempts: 2,
      nextAckAttemptAt: 1_000_500,
    })
    const b = store.create(input)
    store.close()

    const reopened = openJobStore({ path: file, clock })
    try {
      expect(reopened.list()).toHaveLength(2)
      const recovered = reopened.get(a.id)!
      expect(recovered.state).toBe('Delivered')
      expect(recovered.deliveredAt).toBe(1_000_000)
      expect(recovered.scheduledAckAt).toBe(1_000_000 + 3_600_000)
      expect(recovered.ackAttempts).toBe(2)
      expect(recovered.nextAckAttemptAt).toBe(1_000_500)
      expect(reopened.get(b.id)!.state).toBe('Init')
    } finally {
      reopened.close()
    }
  })

  it('recovers everything before a torn final line written during a crash', () => {
    const a = store.create(input)
    store.close()
    appendFileSync(file, '{"op":"put","job":{"id":"half-writ')

    const reopened = openJobStore({ path: file, clock })
    try {
      expect(reopened.list().map((j) => j.id)).toEqual([a.id])
      // and it can still take new writes after healing
      const c = reopened.create(input)
      expect(reopened.list()).toHaveLength(2)
      expect(reopened.get(c.id)).toBeDefined()
    } finally {
      reopened.close()
    }
  })

  it('compacts the log on open so an append-only file does not grow forever', () => {
    const a = store.create(input)
    for (let i = 0; i < 60; i++) store.update(a.id, { ackAttempts: i })
    store.close()
    const before = statSync(file).size

    const reopened = openJobStore({ path: file, clock })
    reopened.close()
    const after = statSync(file).size

    expect(after).toBeLessThan(before)
    const again = openJobStore({ path: file, clock })
    try {
      expect(again.list()).toHaveLength(1)
      expect(again.get(a.id)!.ackAttempts).toBe(59)
    } finally {
      again.close()
    }
  })

  it('writes newline-delimited JSON, one record per line', () => {
    store.create(input)
    store.create(input)
    const lines = readFileSync(file, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    for (const line of lines) expect(() => JSON.parse(line)).not.toThrow()
  })

  it('starts empty when the file does not exist yet', () => {
    const fresh = openJobStore({ path: join(dir, 'nested', 'deep', 'jobs.ndjson'), clock })
    try {
      expect(fresh.list()).toEqual([])
    } finally {
      fresh.close()
    }
  })
})
