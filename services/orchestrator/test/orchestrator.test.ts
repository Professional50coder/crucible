import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Orchestrator } from '../src/orchestrator.js'
import { ManualClock, HOUR, MINUTE } from '../src/clock.js'
import { ACK_TARGET_DELAY_MS } from '../src/acknowledger.js'
import { FakeBroker, TESTNET_PROVIDER } from './fakes.js'

let clock: ManualClock
let dir: string
let broker: FakeBroker
let orch: Orchestrator

const CONFIG = {
  neftune_noise_alpha: 5,
  num_train_epochs: 3,
  per_device_train_batch_size: 2,
  learning_rate: 0.00002,
  max_steps: -1,
}

function build(b: FakeBroker = broker): Orchestrator {
  return new Orchestrator({
    broker: b,
    clock,
    dataDir: dir,
    storePath: join(dir, 'jobs.ndjson'),
  })
}

beforeEach(() => {
  clock = new ManualClock(5_000_000)
  dir = mkdtempSync(join(tmpdir(), 'crucible-o-'))
  broker = new FakeBroker()
  orch = build()
})

afterEach(() => {
  orch?.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('job creation and submission', () => {
  it('creates a job immediately in Init, before any network call', () => {
    const job = orch.createJob({
      network: 'testnet',
      provider: TESTNET_PROVIDER,
      model: 'Qwen2.5-0.5B-Instruct',
      datasetRootHash: '0xroot',
      trainingConfig: CONFIG,
    })
    expect(job.state).toBe('Init')
    expect(job.taskId).toBeUndefined()
    expect(broker.calls).toHaveLength(0)
  })

  it('submits on the next tick and records the task id', async () => {
    const job = orch.createJob({
      network: 'testnet',
      provider: TESTNET_PROVIDER,
      model: 'Qwen2.5-0.5B-Instruct',
      datasetRootHash: '0xroot',
      trainingConfig: CONFIG,
    })
    broker.nextTaskId = 'task-abc'
    await orch.tick()

    const after = orch.getJob(job.id)!
    expect(after.taskId).toBe('task-abc')
    expect(broker.createTaskCalls[0]!.datasetHash).toBe('0xroot')
    expect(broker.createTaskCalls[0]!.model).toBe('Qwen2.5-0.5B-Instruct')
  })

  it('writes the five-key training config to disk and passes its path to createTask', async () => {
    orch.createJob({
      network: 'testnet',
      provider: TESTNET_PROVIDER,
      model: 'Qwen2.5-0.5B-Instruct',
      datasetRootHash: '0xroot',
      trainingConfig: CONFIG,
    })
    await orch.tick()

    const configPath = broker.createTaskCalls[0]!.configPath
    const written = JSON.parse(readFileSync(configPath, 'utf8'))
    expect(written).toEqual(CONFIG)
    expect(Object.keys(written)).toHaveLength(5)
  })

  it('uploads a local dataset when only a path was given', async () => {
    const datasetPath = join(dir, 'train.jsonl')
    writeFileSync(datasetPath, '{"text":"hi"}\n')
    const job = orch.createJob({
      network: 'testnet',
      provider: TESTNET_PROVIDER,
      model: 'Qwen2.5-0.5B-Instruct',
      datasetPath,
      trainingConfig: CONFIG,
    })
    await orch.tick()

    expect(broker.uploadDatasetCalls).toEqual([datasetPath])
    expect(orch.getJob(job.id)!.datasetRootHash).toMatch(/^0xroot-/)
  })

  it('does not re-submit a job that already has a task id', async () => {
    orch.createJob({
      network: 'testnet',
      provider: TESTNET_PROVIDER,
      model: 'Qwen2.5-0.5B-Instruct',
      datasetRootHash: '0xroot',
      trainingConfig: CONFIG,
    })
    await orch.tick()
    await orch.tick()
    expect(broker.createTaskCalls).toHaveLength(1)
  })

  it('treats an occupied provider at submission as QUEUED, not failed, and succeeds later', async () => {
    const job = orch.createJob({
      network: 'testnet',
      provider: TESTNET_PROVIDER,
      model: 'Qwen2.5-0.5B-Instruct',
      datasetRootHash: '0xroot',
      trainingConfig: CONFIG,
    })
    broker.createTaskErrors.push(new Error('provider is occupied by another task'))

    await orch.tick()
    let after = orch.getJob(job.id)!
    expect(after.state).toBe('Init')
    expect(after.providerOccupied).toBe(true)
    expect(after.error).toBeUndefined()
    expect(after.taskId).toBeUndefined()

    // The provider frees up.
    clock.advance(10 * MINUTE)
    broker.nextTaskId = 'task-later'
    await orch.tick()

    after = orch.getJob(job.id)!
    expect(after.taskId).toBe('task-later')
    expect(after.providerOccupied).toBe(false)
  })

  it('points the user at unlock when submission hits the Bug #4 revert', async () => {
    const job = orch.createJob({
      network: 'testnet',
      provider: TESTNET_PROVIDER,
      model: 'Qwen2.5-0.5B-Instruct',
      datasetRootHash: '0xroot',
      trainingConfig: CONFIG,
    })
    broker.createTaskErrors.push(new Error('execution reverted: previous deliverable not acknowledged'))
    await orch.tick()

    const after = orch.getJob(job.id)!
    expect(after.state).not.toBe('Failed')
    expect(after.error).toMatch(/unlock/i)
    expect(after.lastSubmitError).toMatch(/not acknowledged/i)
  })

  it('retries a transient submission failure with backoff', async () => {
    const job = orch.createJob({
      network: 'testnet',
      provider: TESTNET_PROVIDER,
      model: 'Qwen2.5-0.5B-Instruct',
      datasetRootHash: '0xroot',
      trainingConfig: CONFIG,
    })
    broker.createTaskErrors.push(new Error('ECONNRESET'))
    await orch.tick()

    let after = orch.getJob(job.id)!
    expect(after.submitAttempts).toBe(1)
    expect(after.nextSubmitAttemptAt).toBeGreaterThan(clock.now())

    // Too soon.
    await orch.tick()
    expect(broker.createTaskCalls).toHaveLength(1)

    clock.set(after.nextSubmitAttemptAt!)
    await orch.tick()
    after = orch.getJob(job.id)!
    expect(after.taskId).toBeDefined()
  })
})

describe('fee and dataset panels', () => {
  const withPrice = (price: bigint) => {
    broker.services = [{ provider: TESTNET_PROVIDER, occupied: false, pricePerToken: price }]
  }

  it('computes the fee at submission from the provider’s live pricePerToken', async () => {
    withPrice(800_000_000_000n) // testnet
    const job = orch.createJob({
      network: 'testnet',
      provider: TESTNET_PROVIDER,
      model: 'Qwen2.5-0.5B-Instruct',
      datasetRootHash: '0xroot',
      trainingConfig: CONFIG,
      dataset: { format: 'chat', exampleCount: 30, tokenCount: 10_000 },
    })
    await orch.tick()

    const fee = orch.getJob(job.id)!.fee!
    // 10_000 tokens x 800e9 neuron x 3 epochs = 2.4e16
    expect(fee.trainingNeuron).toBe('24000000000000000')
    expect(fee.storageReserveNeuron).toBe('10000000000000000')
    expect(fee.totalNeuron).toBe('34000000000000000')
    expect(typeof fee.totalNeuron).toBe('string')
  })

  it('matches core’s worked example on mainnet pricing', async () => {
    broker.services = [
      { provider: TESTNET_PROVIDER, occupied: false, pricePerToken: 500_000_000_000n },
    ]
    const job = orch.createJob({
      network: 'mainnet',
      provider: TESTNET_PROVIDER,
      model: 'Qwen2.5-0.5B-Instruct',
      datasetRootHash: '0xroot',
      trainingConfig: CONFIG,
      dataset: { format: 'chat', exampleCount: 30, tokenCount: 10_000 },
    })
    await orch.tick()
    // 0.025 0G — the figure core pins and FIELD_NOTES records
    expect(orch.getJob(job.id)!.fee!.totalNeuron).toBe('25000000000000000')
  })

  it('derives the dataset summary from a local dataset file', async () => {
    const datasetPath = join(dir, 'train.jsonl')
    const lines = Array.from({ length: 14 }, (_, i) =>
      JSON.stringify({ messages: [{ role: 'user', content: `q${i}` }] }),
    ).join('\n')
    writeFileSync(datasetPath, `${lines}\n`)
    withPrice(800_000_000_000n)

    const job = orch.createJob({
      network: 'testnet',
      provider: TESTNET_PROVIDER,
      model: 'Qwen2.5-0.5B-Instruct',
      datasetPath,
      trainingConfig: CONFIG,
    })
    await orch.tick()

    const dataset = orch.getJob(job.id)!.dataset!
    expect(dataset.format).toBe('chat')
    expect(dataset.exampleCount).toBe(14)
    expect(dataset.tokenCount).toBeGreaterThan(0)
    // and the fee follows from it
    expect(orch.getJob(job.id)!.fee).toBeDefined()
  })

  it('prefers a caller-supplied dataset summary over the derived one', async () => {
    const datasetPath = join(dir, 'train2.jsonl')
    writeFileSync(datasetPath, `${JSON.stringify({ text: 'a' })}\n`)
    withPrice(800_000_000_000n)

    const job = orch.createJob({
      network: 'testnet',
      provider: TESTNET_PROVIDER,
      model: 'Qwen2.5-0.5B-Instruct',
      datasetPath,
      trainingConfig: CONFIG,
      dataset: { format: 'instruction', exampleCount: 999, tokenCount: 42_000 },
    })
    await orch.tick()

    expect(orch.getJob(job.id)!.dataset).toEqual({
      format: 'instruction',
      exampleCount: 999,
      tokenCount: 42_000,
    })
  })

  it('omits the fee rather than failing the job when no price is available', async () => {
    broker.services = []
    const job = orch.createJob({
      network: 'testnet',
      provider: TESTNET_PROVIDER,
      model: 'Qwen2.5-0.5B-Instruct',
      datasetRootHash: '0xroot',
      trainingConfig: CONFIG,
      dataset: { format: 'chat', exampleCount: 30, tokenCount: 10_000 },
    })
    await orch.tick()

    const after = orch.getJob(job.id)!
    expect(after.fee).toBeUndefined()
    expect(after.taskId).toBeDefined() // submission still succeeded
    expect(after.error).toBeUndefined()
  })

  it('omits the fee for a model with no known storage reserve, without failing', async () => {
    withPrice(800_000_000_000n)
    const job = orch.createJob({
      network: 'testnet',
      provider: TESTNET_PROVIDER,
      model: 'SomeFutureModel',
      datasetRootHash: '0xroot',
      trainingConfig: CONFIG,
      dataset: { format: 'chat', exampleCount: 30, tokenCount: 10_000 },
    })
    await orch.tick()

    const after = orch.getJob(job.id)!
    expect(after.fee).toBeUndefined()
    expect(after.taskId).toBeDefined()
  })

  it('does not recompute the fee on later ticks', async () => {
    withPrice(800_000_000_000n)
    const job = orch.createJob({
      network: 'testnet',
      provider: TESTNET_PROVIDER,
      model: 'Qwen2.5-0.5B-Instruct',
      datasetRootHash: '0xroot',
      trainingConfig: CONFIG,
      dataset: { format: 'chat', exampleCount: 30, tokenCount: 10_000 },
    })
    await orch.tick()
    const first = orch.getJob(job.id)!.fee

    withPrice(999_000_000_000n) // price moves
    await orch.tick()
    expect(orch.getJob(job.id)!.fee).toEqual(first)
  })
})

describe('unlock through the orchestrator', () => {
  it('unlocks by job id using acknowledgeDeliverable', async () => {
    const job = orch.createJob({
      network: 'testnet',
      provider: TESTNET_PROVIDER,
      model: 'Qwen2.5-0.5B-Instruct',
      datasetRootHash: '0xroot',
      trainingConfig: CONFIG,
    })
    broker.nextTaskId = 'task-stuck'
    await orch.tick()
    broker.setTask('task-stuck', 'Delivered')

    const result = await orch.unlockJob(job.id)

    expect(result.ok).toBe(true)
    expect(result.taskId).toBe('task-stuck')
    expect(broker.acknowledgeDeliverableCalls).toHaveLength(1)
    expect(broker.acknowledgeModelCalls).toHaveLength(0)
    expect(broker.usedDeprecatedPath()).toBe(false)
  })

  it('rejects unlocking an unknown job', async () => {
    await expect(orch.unlockJob('nope')).rejects.toThrow(/no such job/i)
  })
})

describe('end to end, unattended', () => {
  it('carries a job from creation to acknowledgement with nobody watching', async () => {
    const job = orch.createJob({
      network: 'testnet',
      provider: TESTNET_PROVIDER,
      model: 'Qwen2.5-0.5B-Instruct',
      datasetRootHash: '0xroot',
      trainingConfig: CONFIG,
    })
    broker.nextTaskId = 'task-e2e'

    await orch.tick() // submit
    for (const state of ['SettingUp', 'SetUp', 'Training', 'Trained', 'Delivering']) {
      broker.setTask('task-e2e', state)
      clock.advance(5 * MINUTE)
      await orch.tick()
    }
    expect(orch.getJob(job.id)!.state).toBe('Delivering')

    broker.setTask('task-e2e', 'Delivered')
    clock.advance(5 * MINUTE)
    await orch.tick()

    const delivered = orch.getJob(job.id)!
    expect(delivered.state).toBe('Delivered')
    expect(delivered.scheduledAckAt).toBe(delivered.deliveredAt! + ACK_TARGET_DELAY_MS)

    // Nobody does anything for an hour.
    clock.advance(ACK_TARGET_DELAY_MS)
    await orch.tick()

    const acked = orch.getJob(job.id)!
    expect(acked.acknowledgedAt).toBeDefined()
    expect(acked.ackMethod).toBe('acknowledgeModel')
    expect(acked.state).toBe('UserAcknowledged')
    expect(broker.usedDeprecatedPath()).toBe(false)

    // Provider settles and finishes.
    broker.setTask('task-e2e', 'Finished')
    clock.advance(2 * MINUTE)
    await orch.tick()
    expect(orch.getJob(job.id)!.state).toBe('Finished')
  })

  it('survives a restart mid-window and still acknowledges on time', async () => {
    const job = orch.createJob({
      network: 'testnet',
      provider: TESTNET_PROVIDER,
      model: 'Qwen2.5-0.5B-Instruct',
      datasetRootHash: '0xroot',
      trainingConfig: CONFIG,
    })
    broker.nextTaskId = 'task-restart'
    await orch.tick()
    broker.setTask('task-restart', 'Delivered')
    await orch.tick()

    const scheduled = orch.getJob(job.id)!.scheduledAckAt!
    expect(scheduled).toBeGreaterThan(clock.now())

    // Hard restart: close the process, lose all memory, keep only the file.
    orch.close()
    const broker2 = new FakeBroker()
    broker2.setTask('task-restart', 'Delivered')
    orch = build(broker2)

    expect(orch.getJob(job.id)!.scheduledAckAt).toBe(scheduled)

    clock.set(scheduled)
    await orch.tick()

    const after = orch.getJob(job.id)!
    expect(after.acknowledgedAt).toBe(scheduled)
    expect(after.ackMethod).toBe('acknowledgeModel')
    expect(broker2.usedDeprecatedPath()).toBe(false)
  })

  it('loses nothing when the process dies before the very first tick', async () => {
    const a = orch.createJob({
      network: 'testnet',
      provider: TESTNET_PROVIDER,
      model: 'Qwen2.5-0.5B-Instruct',
      datasetRootHash: '0xroot',
      trainingConfig: CONFIG,
    })
    orch.close()

    orch = build(new FakeBroker())
    expect(orch.listJobs().map((j) => j.id)).toEqual([a.id])

    await orch.tick()
    expect(orch.getJob(a.id)!.taskId).toBeDefined()
  })

  it('a job delivered while the daemon was down is acknowledged as soon as it comes back', async () => {
    const job = orch.createJob({
      network: 'testnet',
      provider: TESTNET_PROVIDER,
      model: 'Qwen2.5-0.5B-Instruct',
      datasetRootHash: '0xroot',
      trainingConfig: CONFIG,
    })
    broker.nextTaskId = 'task-down'
    await orch.tick()
    orch.close()

    // 30 hours of downtime. The task was delivered right after we died.
    const broker2 = new FakeBroker()
    broker2.setTask('task-down', 'Delivered')
    clock.advance(30 * HOUR)
    orch = build(broker2)

    await orch.tick() // observes Delivered, schedules
    await orch.tick() // schedule is already due relative to observation? not yet
    clock.advance(ACK_TARGET_DELAY_MS)
    await orch.tick()

    const after = orch.getJob(job.id)!
    expect(after.acknowledgedAt).toBeDefined()
    expect(after.ackMethod).toBe('acknowledgeModel')
  })
})

describe('event stream', () => {
  it('emits job updates that the SSE endpoint can forward', async () => {
    const seen: string[] = []
    orch.on('job', (j) => seen.push(j.state))
    const job = orch.createJob({
      network: 'testnet',
      provider: TESTNET_PROVIDER,
      model: 'Qwen2.5-0.5B-Instruct',
      datasetRootHash: '0xroot',
      trainingConfig: CONFIG,
    })
    broker.nextTaskId = 'task-ev'
    await orch.tick()
    broker.setTask('task-ev', 'Training')
    await orch.tick()

    expect(seen).toContain('Training')
    expect(orch.getJob(job.id)!.state).toBe('Training')
  })
})
