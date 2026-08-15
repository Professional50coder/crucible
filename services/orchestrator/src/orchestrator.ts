import { join } from 'node:path'
import { MINUTE, Ticker, systemClock, type Clock } from './clock.js'
import type { FineTuningPort } from './broker.js'
import { Emitter } from './events.js'
import { Acknowledger, type AcknowledgerOptions } from './acknowledger.js'
import { Poller } from './poller.js'
import { QueueRecovery, type LockDetection, type UnlockResult } from './recovery.js'
import { Submitter } from './submitter.js'
import { openJobStore, type JobStore } from './store.js'
import type { CreateJobInput, Job } from './types.js'

export type LogLevel = 'info' | 'warn' | 'error'

export interface OrchestratorOptions {
  broker: FineTuningPort
  clock?: Clock
  /** Root for the job log, downloaded adapters and generated config files. */
  dataDir: string
  storePath?: string
  /** How often `tick()` runs when `start()` is used. Ignored in tests. */
  pollIntervalMs?: number
  onLog?: (level: LogLevel, message: string) => void
  acknowledger?: Pick<
    AcknowledgerOptions,
    'targetDelayMs' | 'fallbackAfterMs' | 'latestMs' | 'deadlineMs' | 'downloadMethod' | 'teeIdleTimeoutMs' | 'teeMaxRetries'
  >
}

interface OrchestratorEvents extends Record<string, unknown> {
  job: Job
  transition: Job
  acknowledged: Job
  deadlineMissed: Job
}

/**
 * The whole unattended pipeline, wired together.
 *
 * `tick()` is one full pass: submit anything new, reconcile everything live,
 * then acknowledge anything due. It is deterministic and takes no timers, which
 * is why every test in this repo can drive days of behaviour in milliseconds.
 * `start()` is the only thing that introduces a real interval.
 */
export class Orchestrator {
  readonly #store: JobStore
  readonly #clock: Clock
  readonly #submitter: Submitter
  readonly #poller: Poller
  readonly #acknowledger: Acknowledger
  readonly #recovery: QueueRecovery
  readonly #emitter = new Emitter<OrchestratorEvents>()
  readonly #ticker: Ticker
  #ticking = false

  constructor(options: OrchestratorOptions) {
    this.#clock = options.clock ?? systemClock
    const log = options.onLog ?? (() => undefined)
    this.#store = openJobStore({
      path: options.storePath ?? join(options.dataDir, 'jobs.ndjson'),
      clock: this.#clock,
    })

    this.#submitter = new Submitter({
      store: this.#store,
      broker: options.broker,
      clock: this.#clock,
      configDir: join(options.dataDir, 'configs'),
      onLog: log,
    })
    this.#poller = new Poller({
      store: this.#store,
      broker: options.broker,
      clock: this.#clock,
    })
    this.#acknowledger = new Acknowledger({
      store: this.#store,
      broker: options.broker,
      clock: this.#clock,
      modelsDir: join(options.dataDir, 'models'),
      onLog: log,
      ...(options.acknowledger ?? {}),
    })
    this.#recovery = new QueueRecovery({
      store: this.#store,
      broker: options.broker,
      clock: this.#clock,
      onLog: log,
    })

    // Fan every component's events out to one stream for the SSE endpoint.
    this.#submitter.on('submitted', (job) => this.#emitter.emit('job', job))
    this.#submitter.on('queued', (job) => this.#emitter.emit('job', job))
    this.#submitter.on('submitFailed', (job) => this.#emitter.emit('job', job))
    this.#poller.on('job', (job) => this.#emitter.emit('job', job))
    this.#poller.on('transition', (job) => this.#emitter.emit('transition', job))
    this.#acknowledger.on('scheduled', (job) => this.#emitter.emit('job', job))
    this.#acknowledger.on('ackFailed', (job) => this.#emitter.emit('job', job))
    this.#acknowledger.on('acknowledged', (job) => {
      this.#emitter.emit('acknowledged', job)
      this.#emitter.emit('job', job)
    })
    this.#acknowledger.on('deadlineMissed', (job) => {
      this.#emitter.emit('deadlineMissed', job)
      this.#emitter.emit('job', job)
    })

    this.#ticker = new Ticker(options.pollIntervalMs ?? MINUTE, () => this.tick())
  }

  on<K extends keyof OrchestratorEvents>(
    event: K,
    listener: (payload: OrchestratorEvents[K]) => void,
  ): () => void {
    return this.#emitter.on(event, listener)
  }

  createJob(input: CreateJobInput): Job {
    return this.#store.create(input)
  }

  getJob(id: string): Job | undefined {
    return this.#store.get(id)
  }

  listJobs(): Job[] {
    return this.#store.list().sort((a, b) => b.createdAt - a.createdAt)
  }

  getLogs(id: string): Promise<string> {
    return this.#poller.fetchLog(id)
  }

  /** One deterministic pass. Never throws. */
  async tick(): Promise<void> {
    if (this.#ticking) return
    this.#ticking = true
    try {
      await this.#submitter.submitPending()
      await this.#poller.poll()
      await this.#acknowledger.tick()
    } finally {
      this.#ticking = false
    }
  }

  /** Begin the real interval. The only place a wall-clock timer is created. */
  start(): void {
    this.#ticker.start()
  }

  stop(): void {
    this.#ticker.stop()
  }

  /** Is this provider's deliverable queue blocked by Bug #4? */
  detectLock(provider: string): Promise<LockDetection> {
    return this.#recovery.detect(provider)
  }

  /** One-call escape hatch, by job. */
  async unlockJob(jobId: string): Promise<UnlockResult> {
    const job = this.#store.get(jobId)
    if (!job) throw new Error(`No such job: ${jobId}`)
    const result = await this.#recovery.unlock(job.provider, job.taskId)
    const updated = this.#store.get(jobId)
    if (updated) this.#emitter.emit('job', updated)
    return result
  }

  /** One-call escape hatch, by raw provider/task — for accounts with no local job. */
  unlock(provider: string, taskId?: string): Promise<UnlockResult> {
    return this.#recovery.unlock(provider, taskId)
  }

  close(): void {
    this.stop()
    this.#store.close()
  }
}
