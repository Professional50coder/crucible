import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Poller } from '../src/poller.js'
import { ManualClock, HOUR } from '../src/clock.js'
import { FakeBroker, tempStore, TESTNET_PROVIDER } from './fakes.js'
import type { JobStore } from '../src/store.js'

let clock: ManualClock
let store: JobStore
let cleanup: () => void
let broker: FakeBroker
let poller: Poller

beforeEach(() => {
  clock = new ManualClock(1_000_000)
  const t = tempStore(clock)
  store = t.store
  cleanup = t.cleanup
  broker = new FakeBroker()
  poller = new Poller({ store, broker, clock })
})

afterEach(() => cleanup())

function deliveredJob(state = 'Init') {
  const job = store.create({ network: 'testnet', provider: TESTNET_PROVIDER, model: 'Qwen2.5-0.5B-Instruct' })
  if (state === 'Init') return store.update(job.id, { taskId: 'task-1' })
  return store.update(job.id, {
    taskId: 'task-1',
    state: state as never,
    transitions: [...job.transitions, { state: state as never, at: clock.now() }],
  })
}

describe('poller', () => {
  it('records a forward state transition with a timestamp', async () => {
    const job = deliveredJob()
    broker.setTask('task-1', 'Training')
    clock.advance(60_000)

    await poller.poll()

    const after = store.get(job.id)!
    expect(after.state).toBe('Training')
    expect(after.transitions.at(-1)).toEqual({ state: 'Training', at: 1_060_000 })
  })

  it('does not append a transition when the state has not moved', async () => {
    const job = deliveredJob('Training')
    broker.setTask('task-1', 'Training')

    await poller.poll()
    await poller.poll()

    expect(store.get(job.id)!.transitions.filter((t) => t.state === 'Training')).toHaveLength(1)
  })

  it('REJECTS a backwards transition and keeps the further-along state', async () => {
    const job = deliveredJob('Delivered')
    broker.setTask('task-1', 'Training')

    await poller.poll()

    const after = store.get(job.id)!
    expect(after.state).toBe('Delivered')
    expect(after.transitions.map((t) => t.state)).not.toContain('Training')
  })

  it('stamps deliveredAt exactly once, when Delivered is first observed', async () => {
    const job = deliveredJob('Delivering')
    broker.setTask('task-1', 'Delivered')
    clock.advance(30_000)
    await poller.poll()

    const first = store.get(job.id)!.deliveredAt
    expect(first).toBe(1_030_000)

    clock.advance(HOUR)
    await poller.poll()
    expect(store.get(job.id)!.deliveredAt).toBe(first)
  })

  it('handles Failed as terminal and records the reason', async () => {
    const job = deliveredJob('Training')
    broker.setTask('task-1', 'Failed')
    await poller.poll()

    const after = store.get(job.id)!
    expect(after.state).toBe('Failed')
    expect(after.error).toMatch(/failed/i)

    // terminal: no longer polled
    const callsBefore = broker.calls.filter((c) => c === 'getTask').length
    await poller.poll()
    expect(broker.calls.filter((c) => c === 'getTask').length).toBe(callsBefore)
  })

  it('does not poll Finished jobs', async () => {
    deliveredJob('Finished')
    await poller.poll()
    expect(broker.calls.filter((c) => c === 'getTask')).toHaveLength(0)
  })

  it('does not poll jobs that have no taskId yet', async () => {
    store.create({ network: 'testnet', provider: TESTNET_PROVIDER })
    await poller.poll()
    expect(broker.calls.filter((c) => c === 'getTask')).toHaveLength(0)
  })

  it('treats an RPC error as transient — never as Failed', async () => {
    const job = deliveredJob('Training')
    broker.getTaskErrors.push(new Error('ECONNRESET'))

    await poller.poll()

    const after = store.get(job.id)!
    expect(after.state).toBe('Training')
    expect(after.error).toBeUndefined()
  })

  it('ignores an unrecognised progress string rather than guessing', async () => {
    const job = deliveredJob('Training')
    broker.setTask('task-1', 'WeirdNewState')
    await poller.poll()
    expect(store.get(job.id)!.state).toBe('Training')
  })

  it('accepts provider casing variations', async () => {
    const job = deliveredJob('Training')
    broker.setTask('task-1', 'delivered')
    await poller.poll()
    expect(store.get(job.id)!.state).toBe('Delivered')
  })

  describe('occupied handling', () => {
    it('marks a job queued — NOT failed — when the provider is occupied', async () => {
      const job = deliveredJob('Init')
      broker.services = [{ provider: TESTNET_PROVIDER, occupied: true }]
      broker.setTask('task-1', 'Init')

      await poller.poll()

      const after = store.get(job.id)!
      expect(after.providerOccupied).toBe(true)
      expect(after.state).toBe('Init')
      expect(after.error).toBeUndefined()
    })

    it('clears the queued flag once the provider frees up', async () => {
      const job = deliveredJob('Init')
      broker.services = [{ provider: TESTNET_PROVIDER, occupied: true }]
      broker.setTask('task-1', 'Init')
      await poller.poll()
      expect(store.get(job.id)!.providerOccupied).toBe(true)

      broker.services = [{ provider: TESTNET_PROVIDER, occupied: false }]
      broker.setTask('task-1', 'Training')
      await poller.poll()

      const after = store.get(job.id)!
      expect(after.providerOccupied).toBe(false)
      expect(after.state).toBe('Training')
    })

    it('treats an "occupied" error from getTask as queued, not failed', async () => {
      const job = deliveredJob('Init')
      broker.getTaskErrors.push(new Error('provider is occupied, please try later'))

      await poller.poll()

      const after = store.get(job.id)!
      expect(after.providerOccupied).toBe(true)
      expect(after.state).toBe('Init')
      expect(after.error).toBeUndefined()
    })
  })

  it('never calls the deprecated queue-locking path', async () => {
    const job = deliveredJob('Delivering')
    broker.setTask('task-1', 'Delivered')
    await poller.poll()
    expect(broker.usedDeprecatedPath()).toBe(false)
    expect(job).toBeDefined()
  })

  it('emits an event for every recorded transition', async () => {
    const seen: string[] = []
    poller.on('transition', (job) => seen.push(job.state))
    deliveredJob('Trained')
    broker.setTask('task-1', 'Delivering')
    await poller.poll()
    expect(seen).toEqual(['Delivering'])
  })
})
