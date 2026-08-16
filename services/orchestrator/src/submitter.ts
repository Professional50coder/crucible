import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MINUTE, HOUR, systemClock, type Clock } from './clock.js'
import { errorMessage, isOccupiedError, isQueueLockedError, type FineTuningPort } from './broker.js'
import { Emitter } from './events.js'
import { analyzeDatasetFile } from './dataset.js'
import { estimateFee } from './fee.js'
import { analyzeDatasetQuality, qualityHeadline } from './quality.js'
import type { JobStore } from './store.js'
import type { Job, JobPatch } from './types.js'

const BACKOFF_BASE_MS = 30_000
const BACKOFF_CAP_MS = 10 * MINUTE

export interface SubmitterOptions {
  store: JobStore
  broker: FineTuningPort
  clock?: Clock
  /** Where per-job training config files are written. */
  configDir: string
  onLog?: (level: 'info' | 'warn' | 'error', message: string) => void
}

interface SubmitterEvents extends Record<string, unknown> {
  submitted: Job
  queued: Job
  submitFailed: Job
}

/**
 * Turns a locally-created job into a real 0G task.
 *
 * `POST /jobs` returns before any of this happens: the job record is durable
 * first, then submission is retried from the tick loop. That ordering is what
 * makes a crash between "user clicked go" and "task exists on-chain" harmless.
 *
 * There is exactly one fine-tuning provider per network and tasks queue one at
 * a time, so `occupied` is the normal case, not the exception. It is never
 * treated as an error.
 */
export class Submitter {
  readonly #store: JobStore
  readonly #broker: FineTuningPort
  readonly #clock: Clock
  readonly #configDir: string
  readonly #log: (level: 'info' | 'warn' | 'error', message: string) => void
  readonly #emitter = new Emitter<SubmitterEvents>()

  constructor(options: SubmitterOptions) {
    this.#store = options.store
    this.#broker = options.broker
    this.#clock = options.clock ?? systemClock
    this.#configDir = options.configDir
    this.#log = options.onLog ?? (() => undefined)
  }

  on<K extends keyof SubmitterEvents>(
    event: K,
    listener: (payload: SubmitterEvents[K]) => void,
  ): () => void {
    return this.#emitter.on(event, listener)
  }

  async submitPending(): Promise<void> {
    const now = this.#clock.now()
    const pending = this.#store
      .list()
      .filter(
        (job) =>
          !job.taskId &&
          job.state === 'Init' &&
          (job.nextSubmitAttemptAt === undefined || job.nextSubmitAttemptAt <= now),
      )
    for (const job of pending) {
      await this.#submitOne(job)
    }
  }

  /**
   * Fill in the Dataset and Fee panels.
   *
   * Both are display-only, so every step degrades to "omit the field" rather
   * than failing a job: a summary the caller already computed with
   * `@crucible/core` wins, a local file is the fallback, and a missing price or
   * an unrecognised model simply means no estimate is shown.
   */
  async #describe(job: Job): Promise<JobPatch> {
    const patch: JobPatch = {}

    const dataset = job.dataset ?? (job.datasetPath ? analyzeDatasetFile(job.datasetPath) : undefined)
    if (dataset && !job.dataset) patch.dataset = dataset

    // Pre-flight quality, once per job, before any money moves. Advisory: it
    // never rejects and never throws (see quality.ts), and the headline logs
    // counts only — never a matched secret.
    if (job.quality === undefined && job.datasetPath) {
      const quality = await analyzeDatasetQuality(job.datasetPath, { now: this.#clock.now() })
      if (quality) {
        patch.quality = quality
        this.#log('info', `job ${job.id}: dataset quality — ${qualityHeadline(quality)}`)
      }
    }

    if (job.fee !== undefined) return patch
    if (!dataset || !job.model || !job.trainingConfig) return patch

    let pricePerToken: bigint | undefined
    try {
      const services = await this.#broker.listService()
      pricePerToken = services.find(
        (s) => s.provider.toLowerCase() === job.provider.toLowerCase(),
      )?.pricePerToken
    } catch {
      return patch
    }
    if (pricePerToken === undefined) return patch

    const epochs = job.trainingConfig.num_train_epochs
    if (!Number.isFinite(epochs) || epochs <= 0) return patch

    try {
      const fee = estimateFee({
        tokenCount: dataset.tokenCount,
        epochs,
        pricePerTokenNeuron: pricePerToken,
        model: job.model,
      })
      patch.fee = {
        trainingNeuron: fee.trainingNeuron.toString(),
        storageReserveNeuron: fee.storageReserveNeuron.toString(),
        totalNeuron: fee.totalNeuron.toString(),
      }
    } catch {
      // Unknown model — no reserve figure exists, so show no estimate.
    }
    return patch
  }

  async #submitOne(job: Job): Promise<void> {
    let datasetRootHash = job.datasetRootHash
    const patch: JobPatch = await this.#describe(job)

    try {
      if (!datasetRootHash) {
        if (!job.datasetPath) {
          throw new Error('Job has neither datasetRootHash nor datasetPath')
        }
        datasetRootHash = await this.#broker.uploadDataset(job.datasetPath)
        patch.datasetRootHash = datasetRootHash
        // Persist the upload before attempting the task, so a crash here does
        // not cost a second upload.
        this.#store.update(job.id, { datasetRootHash })
      }

      if (!job.model) throw new Error('Job has no model')
      const configPath = this.#writeConfig(job)
      const taskId = await this.#broker.createTask(
        job.provider,
        job.model,
        datasetRootHash,
        configPath,
      )

      const updated = this.#store.update(job.id, {
        ...patch,
        taskId,
        providerOccupied: false,
        nextSubmitAttemptAt: undefined,
        lastSubmitError: undefined,
      })
      this.#log('info', `job ${job.id}: submitted as task ${taskId}`)
      this.#emitter.emit('submitted', updated)
    } catch (error) {
      const message = errorMessage(error)
      const attempts = job.submitAttempts + 1

      if (isOccupiedError(error)) {
        // The single provider is busy with someone else's task. Wait our turn.
        const updated = this.#store.update(job.id, {
          ...patch,
          providerOccupied: true,
          nextSubmitAttemptAt: this.#clock.now() + MINUTE,
        })
        this.#log('info', `job ${job.id}: provider occupied, queued`)
        this.#emitter.emit('queued', updated)
        return
      }

      const failurePatch: JobPatch = {
        ...patch,
        submitAttempts: attempts,
        lastSubmitError: message,
        nextSubmitAttemptAt: this.#clock.now() + backoff(attempts),
      }

      if (isQueueLockedError(error)) {
        // Bug #4: the account arrived with a locked queue. Say exactly what to do.
        failurePatch.error =
          'Deliverable queue is locked by a previous unacknowledged task. ' +
          'Call POST /jobs/:id/unlock (or the unlock API) to acknowledge it on-chain and free the queue. ' +
          'This job will keep retrying until then.'
        failurePatch.nextSubmitAttemptAt = this.#clock.now() + HOUR
      }

      const updated = this.#store.update(job.id, failurePatch)
      this.#log('warn', `job ${job.id}: submission attempt ${attempts} failed: ${message}`)
      this.#emitter.emit('submitFailed', updated)
    }
  }

  #writeConfig(job: Job): string {
    mkdirSync(this.#configDir, { recursive: true })
    const path = join(this.#configDir, `${job.id}.json`)
    // Exactly the five keys 0G accepts — extra OR missing keys are rejected.
    writeFileSync(path, `${JSON.stringify(job.trainingConfig ?? {}, null, 2)}\n`, 'utf8')
    return path
  }
}

function backoff(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** (attempts - 1), BACKOFF_CAP_MS)
}
