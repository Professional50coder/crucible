import { systemClock, type Clock } from './clock.js'
import { errorMessage, isOccupiedError, type FineTuningPort } from './broker.js'
import { Emitter } from './events.js'
import { canTransition, isTerminal, normalizeState } from './states.js'
import type { JobStore } from './store.js'
import type { Job, JobPatch } from './types.js'

export interface PollerOptions {
  store: JobStore
  broker: FineTuningPort
  clock?: Clock
  /** Also pull training logs while polling. Off by default; the API pulls on demand. */
  fetchLogs?: boolean
}

interface PollerEvents extends Record<string, unknown> {
  transition: Job
  job: Job
}

/**
 * Walks every live job and reconciles it with what the provider reports.
 *
 * Two rules govern everything here:
 *   1. A job's state only ever moves forward (see `states.ts`). A provider that
 *      flaps, or a stale read, cannot rewind history.
 *   2. A poll failure is transient by default. The ONLY thing that marks a job
 *      `Failed` is the provider explicitly reporting `Failed`. An RPC blip must
 *      never destroy a job that is really still training.
 */
export class Poller {
  readonly #store: JobStore
  readonly #broker: FineTuningPort
  readonly #clock: Clock
  readonly #fetchLogs: boolean
  readonly #emitter = new Emitter<PollerEvents>()

  constructor(options: PollerOptions) {
    this.#store = options.store
    this.#broker = options.broker
    this.#clock = options.clock ?? systemClock
    this.#fetchLogs = options.fetchLogs ?? false
  }

  on<K extends keyof PollerEvents>(event: K, listener: (payload: PollerEvents[K]) => void): () => void {
    return this.#emitter.on(event, listener)
  }

  /** One full sweep of every live job. Never throws. */
  async poll(): Promise<void> {
    const live = this.#store.list().filter((job) => !isTerminal(job.state) && job.taskId)
    if (live.length === 0) return

    const occupiedByProvider = await this.#readOccupancy(live)

    for (const job of live) {
      await this.#pollOne(job, occupiedByProvider)
    }
  }

  async #readOccupancy(jobs: Job[]): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>()
    // Only worth asking while something might still be waiting for its turn.
    const anyWaiting = jobs.some((job) => !job.taskId || occupancyMatters(job))
    if (!anyWaiting) return result
    try {
      const services = await this.#broker.listService()
      for (const service of services) {
        result.set(service.provider.toLowerCase(), Boolean(service.occupied))
      }
    } catch {
      // Occupancy is advisory. Losing it must not stop the sweep.
    }
    return result
  }

  async #pollOne(job: Job, occupiedByProvider: Map<string, boolean>): Promise<void> {
    const patch: JobPatch = {}

    const occupied = occupiedByProvider.get(job.provider.toLowerCase())
    if (occupancyMatters(job) && occupied !== undefined && occupied !== job.providerOccupied) {
      patch.providerOccupied = occupied
    }

    let task
    try {
      task = await this.#broker.getTask(job.provider, job.taskId)
    } catch (error) {
      if (isOccupiedError(error)) {
        // Busy is a queue position, not a failure.
        patch.providerOccupied = true
        this.#apply(job, patch)
        return
      }
      // Transient. Leave the job exactly where it is.
      this.#apply(job, patch)
      return
    }

    const reported = normalizeState(task.progress)
    if (reported && reported !== job.state) {
      if (canTransition(job.state, reported)) {
        patch.state = reported
        patch.transitions = [...job.transitions, { state: reported, at: this.#clock.now() }]

        if (reported === 'Delivered' && job.deliveredAt === undefined) {
          // The 48-hour clock starts now.
          patch.deliveredAt = this.#clock.now()
        }
        if (reported === 'Failed') {
          patch.error = job.error ?? 'Provider reported the task as Failed'
        }
        if (reported !== 'Init') {
          patch.providerOccupied = false
        }
      }
      // else: a backwards report. Ignored on purpose.
    }

    if (this.#fetchLogs) {
      try {
        const log = await this.#broker.getLog(job.provider, job.taskId)
        if (log && log !== job.log) {
          patch.log = log
          patch.logFetchedAt = this.#clock.now()
        }
      } catch {
        // Logs are best-effort.
      }
    }

    this.#apply(job, patch)
  }

  #apply(job: Job, patch: JobPatch): void {
    if (Object.keys(patch).length === 0) return
    const updated = this.#store.update(job.id, patch)
    if (patch.state !== undefined) this.#emitter.emit('transition', updated)
    this.#emitter.emit('job', updated)
  }

  /** Exposed so the API can serve fresh logs on demand. */
  async fetchLog(jobId: string): Promise<string> {
    const job = this.#store.get(jobId)
    if (!job) throw new Error(`No such job: ${jobId}`)
    if (!job.taskId) return job.log ?? ''
    try {
      const log = await this.#broker.getLog(job.provider, job.taskId)
      if (log && log !== job.log) {
        this.#store.update(jobId, { log, logFetchedAt: this.#clock.now() })
      }
      return log ?? job.log ?? ''
    } catch (error) {
      if (job.log) return job.log
      throw new Error(`Could not fetch logs: ${errorMessage(error)}`)
    }
  }
}

/** Occupancy is only meaningful before training actually starts. */
function occupancyMatters(job: Job): boolean {
  return job.state === 'Init' || job.state === 'SettingUp' || job.state === 'SetUp'
}
