import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { QueueRecovery } from '../src/recovery.js'
import { isQueueLockedError } from '../src/broker.js'
import { ManualClock } from '../src/clock.js'
import { FakeBroker, FakeModelRetriever, tempStore, TESTNET_PROVIDER } from './fakes.js'
import type { JobStore } from '../src/store.js'

const REAL_ROOT = '0x40a5f256ff464106f6be38ef146614bd78d5ddfe07af16b156d3efcddb561b4d'

let clock: ManualClock
let store: JobStore
let dir: string
let cleanup: () => void
let broker: FakeBroker
let recovery: QueueRecovery

beforeEach(() => {
  clock = new ManualClock(2_000_000)
  const t = tempStore(clock)
  store = t.store
  dir = t.dir
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

  it('marks the rescued job as a sentinel so it can later be upgraded', async () => {
    const job = store.create({ network: 'testnet', provider: TESTNET_PROVIDER })
    store.update(job.id, { taskId: 'task-old', state: 'Delivered', deliveredAt: 1_000 })
    broker.setTask('task-old', 'Delivered')

    await recovery.unlock(TESTNET_PROVIDER, 'task-old')

    expect(store.get(job.id)!.adapterHashSource).toBe('sentinel')
  })
})

describe('retrieveAndUpgrade — a failed run made whole', () => {
  let retriever: FakeModelRetriever
  let recoveryWithRetriever: QueueRecovery

  beforeEach(() => {
    retriever = new FakeModelRetriever()
    recoveryWithRetriever = new QueueRecovery({
      store,
      broker,
      clock,
      modelsDir: join(dir, 'models'),
      retriever,
    })
  })

  /** A job that failed retrieval and was rescued to a sentinel (queue saved, artifact lost). */
  function sentinelJob(): string {
    const job = store.create({ network: 'testnet', provider: TESTNET_PROVIDER })
    store.update(job.id, {
      taskId: 'task-1',
      state: 'UserAcknowledged',
      deliveredAt: 1_000,
      acknowledgedAt: 1_500,
      ackMethod: 'acknowledgeDeliverable',
      artifactAtRisk: true,
      adapterHashSource: 'sentinel',
    })
    return job.id
  }

  it('retrieves the real artifact and upgrades the passport sentinel → onchain-verified', async () => {
    const jobId = sentinelJob()
    broker.setDeliverable('task-1', REAL_ROOT, /* acknowledged */ true)

    const result = await recoveryWithRetriever.retrieveAndUpgrade(jobId)

    expect(result.ok).toBe(true)
    expect(result.upgraded).toBe(true)
    expect(result.previousHashSource).toBe('sentinel')
    expect(result.adapterHashSource).toBe('onchain-verified')
    expect(result.adapterRootHash).toBe(REAL_ROOT)
    expect(retriever.calls[0]!.rootHash).toBe(REAL_ROOT)

    const after = store.get(jobId)!
    expect(after.adapterHashSource).toBe('onchain-verified')
    expect(after.adapterRootHash).toBe(REAL_ROOT)
    expect(after.artifactAtRisk).toBe(false)
    expect(after.ackMethod).toBe('acknowledgeModel')
  })

  it('does NOT mint a second passport — it upgrades the one job in place', async () => {
    const jobId = sentinelJob()
    broker.setDeliverable('task-1', REAL_ROOT, true)

    expect(store.list()).toHaveLength(1)
    await recoveryWithRetriever.retrieveAndUpgrade(jobId)
    expect(store.list()).toHaveLength(1)
    expect(store.list()[0]!.id).toBe(jobId)
  })

  it('releases the queue on-chain when the deliverable was not already acknowledged', async () => {
    const jobId = sentinelJob()
    broker.setDeliverable('task-1', REAL_ROOT, /* acknowledged */ false)

    await recoveryWithRetriever.retrieveAndUpgrade(jobId)

    expect(broker.acknowledgeDeliverableCalls).toEqual([
      { provider: TESTNET_PROVIDER, taskId: 'task-1' },
    ])
  })

  it('is idempotent once verified — re-running is a no-op success with no new download', async () => {
    const jobId = sentinelJob()
    broker.setDeliverable('task-1', REAL_ROOT, true)
    await recoveryWithRetriever.retrieveAndUpgrade(jobId)
    expect(retriever.calls).toHaveLength(1)

    const second = await recoveryWithRetriever.retrieveAndUpgrade(jobId)
    expect(second.upgraded).toBe(false)
    expect(second.adapterHashSource).toBe('onchain-verified')
    expect(retriever.calls).toHaveLength(1) // no second download
  })

  it('refuses when no on-chain deliverable exists (artifact truly gone)', async () => {
    const jobId = sentinelJob()
    // No setDeliverable → the provider settled and cleared it.
    await expect(recoveryWithRetriever.retrieveAndUpgrade(jobId)).rejects.toThrow(
      /no on-chain deliverable/i,
    )
    // The sentinel stands rather than being overwritten with a lie.
    expect(store.get(jobId)!.adapterHashSource).toBe('sentinel')
  })

  it('propagates a validation failure instead of upgrading', async () => {
    const jobId = sentinelJob()
    broker.setDeliverable('task-1', REAL_ROOT, true)
    retriever.errors.push(new Error('Downloaded artifact FAILED validation'))

    await expect(recoveryWithRetriever.retrieveAndUpgrade(jobId)).rejects.toThrow(/FAILED validation/)
    expect(store.get(jobId)!.adapterHashSource).toBe('sentinel')
  })

  it('refuses when retrieval is not configured', async () => {
    const jobId = sentinelJob()
    broker.setDeliverable('task-1', REAL_ROOT, true)
    // `recovery` (from the outer beforeEach) has no retriever/modelsDir.
    await expect(recovery.retrieveAndUpgrade(jobId)).rejects.toThrow(/not configured/i)
  })
})
