import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { toWireJob } from '../src/wire.js'
import { ManualClock, HOUR } from '../src/clock.js'
import { tempStore, TESTNET_PROVIDER } from './fakes.js'
import type { JobStore } from '../src/store.js'

let clock: ManualClock
let store: JobStore
let cleanup: () => void

const T0 = Date.UTC(2026, 7, 14, 12, 0, 0)

beforeEach(() => {
  clock = new ManualClock(T0)
  const t = tempStore(clock)
  store = t.store
  cleanup = t.cleanup
})

afterEach(() => cleanup())

describe('wire Job — docs/INTERFACES.md section 5', () => {
  it('has exactly the documented keys, no more', () => {
    const job = store.create({ network: 'testnet', provider: TESTNET_PROVIDER })
    expect(Object.keys(toWireJob(job)).sort()).toEqual(
      [
        'ackDeadlineMissed',
        'acknowledgeScheduledFor',
        'acknowledgedAt',
        'adapterPath',
        'artifactAtRisk',
        'createdAt',
        'transitions',
        'datasetRootHash',
        'deliveredAt',
        'error',
        'id',
        'network',
        'provider',
        'queued',
        'state',
        'taskId',
      ].sort(),
    )
  })

  it('uses null, never undefined, for absent values', () => {
    const job = store.create({ network: 'testnet', provider: TESTNET_PROVIDER })
    const wire = toWireJob(job)
    expect(wire.taskId).toBeNull()
    expect(wire.deliveredAt).toBeNull()
    expect(wire.acknowledgedAt).toBeNull()
    expect(wire.acknowledgeScheduledFor).toBeNull()
    expect(wire.datasetRootHash).toBeNull()
    expect(wire.adapterPath).toBeNull()
    expect(wire.error).toBeNull()
    expect(JSON.stringify(wire)).not.toContain('undefined')
  })

  it('renders timestamps as ISO 8601 strings', () => {
    const job = store.create({ network: 'testnet', provider: TESTNET_PROVIDER })
    const wire = toWireJob(job)
    expect(wire.createdAt).toBe('2026-08-14T12:00:00.000Z')
    expect(new Date(wire.createdAt).getTime()).toBe(T0)
  })

  it('exposes acknowledgeScheduledFor on a Delivered job — the UI countdown depends on it', () => {
    const job = store.create({ network: 'testnet', provider: TESTNET_PROVIDER })
    const delivered = store.update(job.id, {
      state: 'Delivered',
      taskId: '0xtask',
      deliveredAt: T0,
      scheduledAckAt: T0 + HOUR,
    })
    const wire = toWireJob(delivered)
    expect(wire.state).toBe('Delivered')
    expect(wire.deliveredAt).toBe('2026-08-14T12:00:00.000Z')
    expect(wire.acknowledgeScheduledFor).toBe('2026-08-14T13:00:00.000Z')
    // and it is comfortably before the 48h deadline
    expect(new Date(wire.acknowledgeScheduledFor!).getTime() - T0).toBeLessThan(48 * HOUR)
  })

  it('surfaces provider occupancy as queued', () => {
    const job = store.create({ network: 'testnet', provider: TESTNET_PROVIDER })
    expect(toWireJob(job).queued).toBe(false)
    const busy = store.update(job.id, { providerOccupied: true })
    const wire = toWireJob(busy)
    expect(wire.queued).toBe(true)
    // queued is NOT an error
    expect(wire.error).toBeNull()
  })

  describe('the four panel fields added 2026-08-14', () => {
    it('omits all four when the job carries none of them', () => {
      const job = store.create({ network: 'testnet', provider: TESTNET_PROVIDER })
      const wire = toWireJob(job)
      expect(wire.model).toBeUndefined()
      expect(wire.config).toBeUndefined()
      expect(wire.fee).toBeUndefined()
      expect(wire.dataset).toBeUndefined()
      // absent, not null — they are declared optional in the spec
      expect(Object.keys(wire)).not.toContain('fee')
      expect(Object.keys(wire)).not.toContain('dataset')
    })

    it('echoes back the model and the five-key config that were submitted', () => {
      const config = {
        neftune_noise_alpha: 5,
        num_train_epochs: 3,
        per_device_train_batch_size: 2,
        learning_rate: 0.00002,
        max_steps: -1,
      }
      const job = store.create({
        network: 'testnet',
        provider: TESTNET_PROVIDER,
        model: 'Qwen2.5-0.5B-Instruct',
        trainingConfig: config,
      })
      const wire = toWireJob(job)
      expect(wire.model).toBe('Qwen2.5-0.5B-Instruct')
      expect(wire.config).toEqual(config)
      expect(Object.keys(wire.config!)).toHaveLength(5)
    })

    it('carries fee as STRINGS so it survives the JSON hop', () => {
      const job = store.create({ network: 'testnet', provider: TESTNET_PROVIDER })
      const withFee = store.update(job.id, {
        fee: {
          trainingNeuron: '15000000000000000',
          storageReserveNeuron: '10000000000000000',
          totalNeuron: '25000000000000000',
        },
      })
      const wire = toWireJob(withFee)
      expect(typeof wire.fee!.totalNeuron).toBe('string')

      const roundTripped = JSON.parse(JSON.stringify(wire))
      expect(roundTripped.fee.trainingNeuron).toBe('15000000000000000')
      expect(roundTripped.fee.totalNeuron).toBe('25000000000000000')
      // A bigint would have thrown on stringify; a number would have lost precision.
      expect(BigInt(roundTripped.fee.totalNeuron)).toBe(25_000_000_000_000_000n)
    })

    it('carries the dataset summary', () => {
      const job = store.create({ network: 'testnet', provider: TESTNET_PROVIDER })
      const withDataset = store.update(job.id, {
        dataset: { format: 'chat', exampleCount: 30, tokenCount: 12_000 },
      })
      const wire = toWireJob(withDataset)
      expect(wire.dataset).toEqual({ format: 'chat', exampleCount: 30, tokenCount: 12_000 })
    })

    it('still emits every original key alongside the new ones', () => {
      const job = store.create({
        network: 'testnet',
        provider: TESTNET_PROVIDER,
        model: 'Qwen2.5-0.5B-Instruct',
      })
      const keys = Object.keys(toWireJob(job))
      for (const original of [
        'id', 'network', 'provider', 'taskId', 'state', 'createdAt', 'deliveredAt',
        'acknowledgedAt', 'acknowledgeScheduledFor', 'datasetRootHash', 'adapterPath',
        'error', 'queued', 'artifactAtRisk',
      ]) {
        expect(keys).toContain(original)
      }
    })
  })

  describe('transitions — the state history the client renders a timeline from', () => {
    it('carries the seeded Init transition on a brand-new job', () => {
      const job = store.create({ network: 'testnet', provider: TESTNET_PROVIDER })
      const wire = toWireJob(job)
      expect(wire.transitions).toEqual([{ state: 'Init', at: '2026-08-14T12:00:00.000Z' }])
    })

    it('renders every `at` as an ISO string, matching the other wire timestamps', () => {
      const job = store.create({ network: 'testnet', provider: TESTNET_PROVIDER })
      const moved = store.update(job.id, {
        state: 'Delivered',
        transitions: [
          { state: 'Init', at: T0 },
          { state: 'Training', at: T0 + HOUR },
          { state: 'Delivered', at: T0 + 5 * HOUR },
        ],
      })
      const wire = toWireJob(moved)
      expect(wire.transitions).toEqual([
        { state: 'Init', at: '2026-08-14T12:00:00.000Z' },
        { state: 'Training', at: '2026-08-14T13:00:00.000Z' },
        { state: 'Delivered', at: '2026-08-14T17:00:00.000Z' },
      ])
      // Same convention as createdAt: an ISO string, never an epoch number.
      for (const transition of wire.transitions) {
        expect(typeof transition.at).toBe('string')
        expect(Number.isFinite(new Date(transition.at).getTime())).toBe(true)
      }
      expect(new Date(wire.transitions[2]!.at).getTime()).toBe(T0 + 5 * HOUR)
    })

    it('preserves order and each entry has exactly the two documented keys', () => {
      const job = store.create({ network: 'testnet', provider: TESTNET_PROVIDER })
      const moved = store.update(job.id, {
        transitions: [
          { state: 'Init', at: T0 },
          { state: 'Delivered', at: T0 + HOUR },
          { state: 'UserAcknowledged', at: T0 + 2 * HOUR },
        ],
      })
      const wire = toWireJob(moved)
      expect(wire.transitions.map((t) => t.state)).toEqual([
        'Init',
        'Delivered',
        'UserAcknowledged',
      ])
      for (const transition of wire.transitions) {
        expect(Object.keys(transition).sort()).toEqual(['at', 'state'])
      }
    })

    it('survives the JSON hop intact', () => {
      const job = store.create({ network: 'testnet', provider: TESTNET_PROVIDER })
      const moved = store.update(job.id, {
        transitions: [
          { state: 'Init', at: T0 },
          { state: 'Training', at: T0 + HOUR },
        ],
      })
      const roundTripped = JSON.parse(JSON.stringify(toWireJob(moved)))
      expect(roundTripped.transitions).toHaveLength(2)
      expect(roundTripped.transitions[1]).toEqual({
        state: 'Training',
        at: '2026-08-14T13:00:00.000Z',
      })
    })

    it('emits an empty array, never undefined, for a record with no history', () => {
      const job = store.create({ network: 'testnet', provider: TESTNET_PROVIDER })
      // A record written before transitions were tracked. The key must still
      // be present — the client destructures it.
      const wire = toWireJob({ ...job, transitions: undefined as never })
      expect(wire.transitions).toEqual([])
      expect(Object.keys(wire)).toContain('transitions')
      expect(JSON.stringify(wire)).not.toContain('undefined')
    })
  })

  describe('ackDeadlineMissed — the worst outcome, as a field not a substring', () => {
    it('is false on a job that has not missed the deadline', () => {
      const job = store.create({ network: 'testnet', provider: TESTNET_PROVIDER })
      const wire = toWireJob(job)
      expect(wire.ackDeadlineMissed).toBe(false)
      expect(typeof wire.ackDeadlineMissed).toBe('boolean')
    })

    it('is true once the window closed with no acknowledgement — no substring match needed', () => {
      const job = store.create({ network: 'testnet', provider: TESTNET_PROVIDER })
      const missed = store.update(job.id, {
        state: 'Delivered',
        deliveredAt: T0,
        ackDeadlineMissed: true,
        error: 'Acknowledgement deadline passed: the model is lost and 30% of the fee is forfeit.',
      })
      const wire = toWireJob(missed)
      expect(wire.ackDeadlineMissed).toBe(true)
      // The point of the field: reading it must not depend on the wording of
      // `error`, which we are free to reword at any time.
      expect(JSON.parse(JSON.stringify(wire)).ackDeadlineMissed).toBe(true)
    })

    it('stays false when the artifact is at risk but the deadline was met', () => {
      const job = store.create({ network: 'testnet', provider: TESTNET_PROVIDER })
      // The recovery path: acknowledged on-chain inside the window without a
      // download. The artifact may be gone; the 30% penalty was avoided.
      const rescued = store.update(job.id, {
        state: 'UserAcknowledged',
        acknowledgedAt: T0 + HOUR,
        ackMethod: 'acknowledgeDeliverable',
        artifactAtRisk: true,
      })
      const wire = toWireJob(rescued)
      expect(wire.artifactAtRisk).toBe(true)
      expect(wire.ackDeadlineMissed).toBe(false)
    })
  })

  it('keeps state a plain string, not an enum or a number', () => {
    const job = store.create({ network: 'testnet', provider: TESTNET_PROVIDER })
    const wire = toWireJob(store.update(job.id, { state: 'Training' }))
    expect(typeof wire.state).toBe('string')
    expect(wire.state).toBe('Training')
    expect(JSON.parse(JSON.stringify(wire)).state).toBe('Training')
  })
})
