import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import {
  Acknowledger,
  ACK_DEADLINE_MS,
  ACK_TARGET_DELAY_MS,
  ACK_LATEST_MS,
  ACK_FALLBACK_AFTER_MS,
} from '../src/acknowledger.js'
import { ManualClock, HOUR, MINUTE } from '../src/clock.js'
import { FakeBroker, tempStore, TESTNET_PROVIDER } from './fakes.js'
import type { JobStore } from '../src/store.js'
import type { Job } from '../src/types.js'

let clock: ManualClock
let store: JobStore
let dir: string
let cleanup: () => void
let broker: FakeBroker
let ack: Acknowledger

const T0 = 1_000_000_000

beforeEach(() => {
  clock = new ManualClock(T0)
  const t = tempStore(clock)
  store = t.store
  dir = t.dir
  cleanup = t.cleanup
  broker = new FakeBroker()
  ack = new Acknowledger({ store, broker, clock, modelsDir: join(dir, 'models') })
})

afterEach(() => cleanup())

/** A job that the poller has just seen reach Delivered. */
function delivered(deliveredAt = clock.now()): Job {
  const job = store.create({ network: 'testnet', provider: TESTNET_PROVIDER })
  return store.update(job.id, {
    taskId: 'task-1',
    state: 'Delivered',
    deliveredAt,
    transitions: [...job.transitions, { state: 'Delivered', at: deliveredAt }],
  })
}

describe('deadline constants', () => {
  it('encodes 0G’s real 48-hour window, and leaves real margin', () => {
    expect(ACK_DEADLINE_MS).toBe(48 * HOUR)
    expect(ACK_TARGET_DELAY_MS).toBe(1 * HOUR)
    expect(ACK_LATEST_MS).toBe(40 * HOUR)
    expect(ACK_LATEST_MS).toBeLessThan(ACK_DEADLINE_MS)
    expect(ACK_FALLBACK_AFTER_MS).toBeLessThan(ACK_LATEST_MS)
    // At least 8 hours of margin between our last action and losing the model.
    expect(ACK_DEADLINE_MS - ACK_LATEST_MS).toBeGreaterThanOrEqual(8 * HOUR)
  })
})

describe('scheduling', () => {
  it('schedules acknowledgement ~1 hour after delivery, well inside the window', async () => {
    const job = delivered()
    await ack.tick()

    const after = store.get(job.id)!
    expect(after.scheduledAckAt).toBe(T0 + ACK_TARGET_DELAY_MS)
    expect(after.scheduledAckAt! - after.deliveredAt!).toBeLessThan(ACK_DEADLINE_MS)
  })

  it('never schedules later than 40 hours, even if misconfigured to something reckless', async () => {
    const reckless = new Acknowledger({
      store,
      broker,
      clock,
      modelsDir: join(dir, 'models'),
      targetDelayMs: 47 * HOUR,
    })
    const job = delivered()
    await reckless.tick()

    const after = store.get(job.id)!
    expect(after.scheduledAckAt).toBe(T0 + ACK_LATEST_MS)
    expect(after.scheduledAckAt! - after.deliveredAt!).toBeLessThanOrEqual(ACK_LATEST_MS)
  })

  it('schedules immediately for a job already delivered long ago (adopted after downtime)', async () => {
    const job = delivered(T0 - 20 * HOUR)
    await ack.tick()
    const after = store.get(job.id)!
    // 20h ago + 1h target is already in the past, so it acts now.
    expect(after.acknowledgedAt).toBeDefined()
  })

  it('does not acknowledge before the scheduled time', async () => {
    delivered()
    await ack.tick()
    clock.advance(ACK_TARGET_DELAY_MS - MINUTE)
    await ack.tick()

    expect(broker.acknowledgeModelCalls).toHaveLength(0)
  })

  it('ignores jobs that are not Delivered', async () => {
    const job = store.create({ network: 'testnet', provider: TESTNET_PROVIDER })
    store.update(job.id, { taskId: 'task-1', state: 'Training' })
    await ack.tick()
    expect(broker.acknowledgeModelCalls).toHaveLength(0)
    expect(store.get(job.id)!.scheduledAckAt).toBeUndefined()
  })
})

describe('acknowledging', () => {
  it('acknowledges with acknowledgeModel at the scheduled time and records the outcome', async () => {
    const job = delivered()
    await ack.tick()
    clock.advance(ACK_TARGET_DELAY_MS)
    await ack.tick()

    expect(broker.acknowledgeModelCalls).toHaveLength(1)
    const call = broker.acknowledgeModelCalls[0]!
    expect(call.provider).toBe(TESTNET_PROVIDER)
    expect(call.taskId).toBe('task-1')
    expect(call.dataPath).toContain(job.id)

    const after = store.get(job.id)!
    expect(after.acknowledgedAt).toBe(T0 + ACK_TARGET_DELAY_MS)
    expect(after.ackMethod).toBe('acknowledgeModel')
    expect(after.state).toBe('UserAcknowledged')
    expect(after.adapterPath).toContain(job.id)
    expect(after.artifactAtRisk).toBeFalsy()
  })

  it('NEVER calls the deprecated download+decrypt path that locks the queue', async () => {
    delivered()
    await ack.tick()
    clock.advance(ACK_TARGET_DELAY_MS)
    await ack.tick()

    expect(broker.usedDeprecatedPath()).toBe(false)
    expect(broker.calls).toContain('acknowledgeModel')
  })

  it('acknowledges each job exactly once', async () => {
    delivered()
    await ack.tick()
    clock.advance(ACK_TARGET_DELAY_MS)
    await ack.tick()
    clock.advance(HOUR)
    await ack.tick()
    await ack.tick()

    expect(broker.acknowledgeModelCalls).toHaveLength(1)
  })

  it('emits an acknowledged event', async () => {
    const seen: string[] = []
    ack.on('acknowledged', (j) => seen.push(j.ackMethod!))
    delivered()
    await ack.tick()
    clock.advance(ACK_TARGET_DELAY_MS)
    await ack.tick()
    expect(seen).toEqual(['acknowledgeModel'])
  })
})

describe('retry with exponential backoff', () => {
  it('retries after a transient failure, with a growing delay, without giving up', async () => {
    const job = delivered()
    await ack.tick()
    clock.advance(ACK_TARGET_DELAY_MS)

    broker.acknowledgeModelErrors.push(new Error('ETIMEDOUT'))
    await ack.tick()

    let after = store.get(job.id)!
    expect(after.ackAttempts).toBe(1)
    expect(after.acknowledgedAt).toBeUndefined()
    expect(after.lastAckError).toMatch(/ETIMEDOUT/)
    const firstDelay = after.nextAckAttemptAt! - clock.now()
    expect(firstDelay).toBeGreaterThan(0)

    // Too early: no second attempt.
    await ack.tick()
    expect(broker.acknowledgeModelCalls).toHaveLength(1)

    // At the retry time it tries again, and the next backoff is longer.
    clock.set(after.nextAckAttemptAt!)
    broker.acknowledgeModelErrors.push(new Error('ETIMEDOUT again'))
    await ack.tick()
    after = store.get(job.id)!
    expect(broker.acknowledgeModelCalls).toHaveLength(2)
    expect(after.ackAttempts).toBe(2)
    const secondDelay = after.nextAckAttemptAt! - clock.now()
    expect(secondDelay).toBeGreaterThan(firstDelay)
  })

  it('caps the backoff so it can never overshoot the window', async () => {
    const job = delivered()
    await ack.tick()
    clock.advance(ACK_TARGET_DELAY_MS)

    for (let i = 0; i < 12; i++) {
      broker.acknowledgeModelErrors.push(new Error('boom'))
      const current = store.get(job.id)!
      if (current.nextAckAttemptAt && current.nextAckAttemptAt > clock.now()) {
        clock.set(current.nextAckAttemptAt)
      }
      await ack.tick()
      const after = store.get(job.id)!
      if (after.nextAckAttemptAt) {
        expect(after.nextAckAttemptAt - clock.now()).toBeLessThanOrEqual(HOUR)
      }
    }
    expect(store.get(job.id)!.ackAttempts).toBeGreaterThan(5)
  })

  it('eventually succeeds after transient failures, still via acknowledgeModel', async () => {
    const job = delivered()
    await ack.tick()
    clock.advance(ACK_TARGET_DELAY_MS)

    broker.acknowledgeModelErrors.push(new Error('flaky'))
    await ack.tick()
    clock.set(store.get(job.id)!.nextAckAttemptAt!)
    await ack.tick()

    const after = store.get(job.id)!
    expect(after.acknowledgedAt).toBeDefined()
    expect(after.ackMethod).toBe('acknowledgeModel')
    expect(broker.acknowledgeDeliverableCalls).toHaveLength(0)
  })
})

describe('fallback to acknowledgeDeliverable', () => {
  it('does NOT fall back early, no matter how many times acknowledgeModel fails', async () => {
    const job = delivered()
    await ack.tick()
    clock.advance(ACK_TARGET_DELAY_MS)

    for (let i = 0; i < 20; i++) {
      broker.acknowledgeModelErrors.push(new Error('still failing'))
      const current = store.get(job.id)!
      if (current.nextAckAttemptAt && current.nextAckAttemptAt > clock.now()) {
        clock.set(current.nextAckAttemptAt)
      }
      // Stay comfortably before the fallback threshold.
      if (clock.now() - job.deliveredAt! >= ACK_FALLBACK_AFTER_MS) break
      await ack.tick()
    }

    expect(broker.acknowledgeDeliverableCalls).toHaveLength(0)
    expect(store.get(job.id)!.artifactAtRisk).toBeFalsy()
  })

  it('falls back once the deadline is near and acknowledgeModel is still failing', async () => {
    const job = delivered()
    await ack.tick()

    clock.set(T0 + ACK_FALLBACK_AFTER_MS)
    broker.acknowledgeModelErrors.push(new Error('artifact garbage collected'))
    await ack.tick()

    const after = store.get(job.id)!
    expect(broker.acknowledgeDeliverableCalls).toHaveLength(1)
    expect(broker.acknowledgeDeliverableCalls[0]).toEqual({
      provider: TESTNET_PROVIDER,
      taskId: 'task-1',
    })
    expect(after.ackMethod).toBe('acknowledgeDeliverable')
    expect(after.acknowledgedAt).toBe(T0 + ACK_FALLBACK_AFTER_MS)
    expect(after.state).toBe('UserAcknowledged')
  })

  it('records LOUDLY that the artifact may be lost when it falls back', async () => {
    const job = delivered()
    await ack.tick()
    clock.set(T0 + ACK_FALLBACK_AFTER_MS)
    broker.acknowledgeModelErrors.push(new Error('artifact garbage collected'))
    await ack.tick()

    const after = store.get(job.id)!
    expect(after.artifactAtRisk).toBe(true)
    expect(after.error).toMatch(/artifact/i)
    expect(after.error).toMatch(/queue/i)
  })

  it('still tries acknowledgeModel first even at the fallback threshold', async () => {
    delivered()
    await ack.tick()
    clock.set(T0 + ACK_FALLBACK_AFTER_MS)
    await ack.tick()

    // acknowledgeModel succeeded, so no fallback and no risk.
    expect(broker.acknowledgeModelCalls).toHaveLength(1)
    expect(broker.acknowledgeDeliverableCalls).toHaveLength(0)
  })

  it('records the deadline as missed if even the fallback fails past the window', async () => {
    const job = delivered()
    await ack.tick()
    clock.set(T0 + ACK_LATEST_MS)
    broker.acknowledgeModelErrors.push(new Error('gone'))
    broker.acknowledgeDeliverableErrors.push(new Error('rpc down'))
    await ack.tick()

    clock.set(T0 + ACK_DEADLINE_MS + MINUTE)
    await ack.tick()

    const after = store.get(job.id)!
    expect(after.ackDeadlineMissed).toBe(true)
    expect(after.error).toMatch(/48/)
  })
})

describe('restart safety', () => {
  it('a fresh daemon over the same store honours work scheduled before the crash', async () => {
    const job = delivered()
    await ack.tick()
    const scheduled = store.get(job.id)!.scheduledAckAt!

    // Process dies. A brand new Acknowledger, brand new broker, same store.
    const broker2 = new FakeBroker()
    const ack2 = new Acknowledger({ store, broker: broker2, clock, modelsDir: join(dir, 'models') })

    clock.set(scheduled)
    await ack2.tick()

    expect(broker2.acknowledgeModelCalls).toHaveLength(1)
    expect(store.get(job.id)!.acknowledgedAt).toBe(scheduled)
    expect(store.get(job.id)!.ackMethod).toBe('acknowledgeModel')
  })

  it('does not re-acknowledge a job that was already acknowledged before the crash', async () => {
    const job = delivered()
    await ack.tick()
    clock.advance(ACK_TARGET_DELAY_MS)
    await ack.tick()

    const broker2 = new FakeBroker()
    const ack2 = new Acknowledger({ store, broker: broker2, clock, modelsDir: join(dir, 'models') })
    clock.advance(HOUR)
    await ack2.tick()

    expect(broker2.acknowledgeModelCalls).toHaveLength(0)
    expect(store.get(job.id)!.ackMethod).toBe('acknowledgeModel')
  })

  it('resumes the retry backoff rather than restarting it', async () => {
    const job = delivered()
    await ack.tick()
    clock.advance(ACK_TARGET_DELAY_MS)
    broker.acknowledgeModelErrors.push(new Error('nope'))
    await ack.tick()
    const attemptsBefore = store.get(job.id)!.ackAttempts
    const nextBefore = store.get(job.id)!.nextAckAttemptAt!

    const broker2 = new FakeBroker()
    const ack2 = new Acknowledger({ store, broker: broker2, clock, modelsDir: join(dir, 'models') })
    await ack2.tick()
    // Still inside the backoff: no attempt yet.
    expect(broker2.acknowledgeModelCalls).toHaveLength(0)
    expect(store.get(job.id)!.ackAttempts).toBe(attemptsBefore)

    clock.set(nextBefore)
    await ack2.tick()
    expect(broker2.acknowledgeModelCalls).toHaveLength(1)
  })
})
