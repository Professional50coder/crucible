import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { QueueRecovery } from '../src/recovery.js'
import { isQueueLockedError } from '../src/broker.js'
import { ManualClock } from '../src/clock.js'
import { FakeBroker, tempStore, TESTNET_PROVIDER } from './fakes.js'
import type { JobStore } from '../src/store.js'

let clock: ManualClock
let store: JobStore
let cleanup: () => void
let broker: FakeBroker
let recovery: QueueRecovery

beforeEach(() => {
  clock = new ManualClock(2_000_000)
  const t = tempStore(clock)
  store = t.store
  cleanup = t.cleanup
  broker = new FakeBroker()
  recovery = new QueueRecovery({ store, broker, clock })
})

afterEach(() => cleanup())

describe('Bug #4 detection', () => {
  it('recognises the on-chain revert that means the queue is locked', () => {
    expect(isQueueLockedError(new Error('execution reverted: previous deliverable not acknowledged'))).toBe(true)
    expect(isQueueLockedError(new Error('insufficient funds'))).toBe(false)
  })

  it('reports a clean provider as not locked', async () => {
    broker.setTask('task-1', 'Finished')
    const result = await recovery.detect(TESTNET_PROVIDER)
    expect(result.locked).toBe(false)
    expect(result.taskId).toBeUndefined()
  })

  it('reports no lock when nothing has ever been delivered', async () => {
    broker.setTask('task-1', 'Training')
    const result = await recovery.detect(TESTNET_PROVIDER)
    expect(result.locked).toBe(false)
  })

  it('detects a Delivered task that was never acknowledged as a locked queue', async () => {
    broker.setTask('task-old', 'Delivered')
    broker.setTask('task-new', 'Finished')

    const result = await recovery.detect(TESTNET_PROVIDER)

    expect(result.locked).toBe(true)
    expect(result.taskId).toBe('task-old')
    expect(result.reason).toMatch(/acknowledg/i)
  })

  it('does not treat UserAcknowledged as locked', async () => {
    broker.setTask('task-1', 'UserAcknowledged')
    expect((await recovery.detect(TESTNET_PROVIDER)).locked).toBe(false)
  })
})

describe('unlock', () => {
  it('acknowledges on-chain without downloading, and reports success', async () => {
    broker.setTask('task-old', 'Delivered')

    const result = await recovery.unlock(TESTNET_PROVIDER, 'task-old')

    expect(result.ok).toBe(true)
    expect(result.taskId).toBe('task-old')
    expect(broker.acknowledgeDeliverableCalls).toEqual([
      { provider: TESTNET_PROVIDER, taskId: 'task-old' },
    ])
  })

  it('never downloads, and never touches the deprecated path', async () => {
    broker.setTask('task-old', 'Delivered')
    await recovery.unlock(TESTNET_PROVIDER, 'task-old')

    expect(broker.acknowledgeModelCalls).toHaveLength(0)
    expect(broker.usedDeprecatedPath()).toBe(false)
  })

  it('auto-detects the offending task when no taskId is given', async () => {
    broker.setTask('task-old', 'Delivered')
    const result = await recovery.unlock(TESTNET_PROVIDER)
    expect(result.taskId).toBe('task-old')
    expect(broker.acknowledgeDeliverableCalls[0]!.taskId).toBe('task-old')
  })

  it('refuses when there is nothing to unlock', async () => {
    broker.setTask('task-1', 'Finished')
    await expect(recovery.unlock(TESTNET_PROVIDER)).rejects.toThrow(/no unacknowledged/i)
    expect(broker.acknowledgeDeliverableCalls).toHaveLength(0)
  })

  it('is idempotent — an already-acknowledged deliverable counts as unlocked', async () => {
    broker.setTask('task-old', 'Delivered')
    broker.acknowledgeDeliverableErrors.push(new Error('execution reverted: deliverable already acknowledged'))

    const result = await recovery.unlock(TESTNET_PROVIDER, 'task-old')

    expect(result.ok).toBe(true)
    expect(result.alreadyAcknowledged).toBe(true)
  })

  it('propagates a genuine failure instead of pretending it worked', async () => {
    broker.setTask('task-old', 'Delivered')
    broker.acknowledgeDeliverableErrors.push(new Error('insufficient funds for gas'))
    await expect(recovery.unlock(TESTNET_PROVIDER, 'task-old')).rejects.toThrow(/insufficient funds/)
  })

  it('records loudly on the matching local job that the artifact may be gone', async () => {
    const job = store.create({ network: 'testnet', provider: TESTNET_PROVIDER })
    store.update(job.id, { taskId: 'task-old', state: 'Delivered', deliveredAt: 1_000 })
    broker.setTask('task-old', 'Delivered')

    await recovery.unlock(TESTNET_PROVIDER, 'task-old')

    const after = store.get(job.id)!
    expect(after.ackMethod).toBe('acknowledgeDeliverable')
    expect(after.acknowledgedAt).toBe(2_000_000)
    expect(after.artifactAtRisk).toBe(true)
    expect(after.error).toMatch(/without downloading/i)
    expect(after.state).toBe('UserAcknowledged')
  })

  it('works for a task Crucible has no local record of', async () => {
    broker.setTask('task-foreign', 'Delivered')
    const result = await recovery.unlock(TESTNET_PROVIDER, 'task-foreign')
    expect(result.ok).toBe(true)
    expect(store.list()).toHaveLength(0)
  })
})
