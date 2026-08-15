import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { HOUR, MINUTE, systemClock, type Clock } from './clock.js'
import { errorMessage, type AcknowledgeModelOptions, type FineTuningPort } from './broker.js'
import { Emitter } from './events.js'
import { canTransition } from './states.js'
import type { JobStore } from './store.js'
import type { Job, JobPatch } from './types.js'

/**
 * ## Failure mode 1: the 48-hour deadline
 *
 * When a 0G fine-tuning task reaches `Delivered` the user has 48 hours to
 * acknowledge. Miss it and they lose the fine-tuned model AND 30% of the fee is
 * deducted. 0G issues no warning; the user is simply expected to be sitting at
 * a CLI polling. This daemon is the thing that sits there instead.
 *
 * The timing is deliberately unadventurous:
 *
 * ```
 * delivered ──1h──▶ act ..............36h..............▶ fallback
 *                                                  40h ▶ last possible action
 *                                                                48h ▶ MODEL LOST
 * ```
 *
 * We act at +1h — long enough for the provider to have settled, short enough
 * that 47 hours of margin remain if something goes wrong. Every later number
 * exists only as a floor under a failure: even in the worst case we stop trying
 * a full 8 hours before the user could lose anything.
 */
export const ACK_DEADLINE_MS = 48 * HOUR

/** Normal case: acknowledge one hour after delivery. */
export const ACK_TARGET_DELAY_MS = 1 * HOUR

/** Hard ceiling on scheduling. Nothing is ever scheduled later than this. */
export const ACK_LATEST_MS = 40 * HOUR

/**
 * Only past this point may we give up on retrieving the artifact and settle for
 * saving the queue. 12 hours of deadline still remain at this moment.
 */
export const ACK_FALLBACK_AFTER_MS = 36 * HOUR

const BACKOFF_BASE_MS = 1 * MINUTE
const BACKOFF_CAP_MS = 1 * HOUR

export interface AcknowledgerOptions {
  store: JobStore
  broker: FineTuningPort
  clock?: Clock
  /** Root directory for downloaded adapters. Each job gets a subdirectory. */
  modelsDir: string
  targetDelayMs?: number
  fallbackAfterMs?: number
  latestMs?: number
  deadlineMs?: number
  downloadMethod?: AcknowledgeModelOptions['downloadMethod']
  teeIdleTimeoutMs?: number
  teeMaxRetries?: number
  onLog?: (level: 'info' | 'warn' | 'error', message: string) => void
}

interface AcknowledgerEvents extends Record<string, unknown> {
  scheduled: Job
  acknowledged: Job
  ackFailed: Job
  deadlineMissed: Job
}

export class Acknowledger {
  readonly #store: JobStore
  readonly #broker: FineTuningPort
  readonly #clock: Clock
  readonly #modelsDir: string
  readonly #targetDelayMs: number
  readonly #fallbackAfterMs: number
  readonly #latestMs: number
  readonly #deadlineMs: number
  readonly #ackOptions: AcknowledgeModelOptions
  readonly #log: (level: 'info' | 'warn' | 'error', message: string) => void
  readonly #emitter = new Emitter<AcknowledgerEvents>()

  constructor(options: AcknowledgerOptions) {
    this.#store = options.store
    this.#broker = options.broker
    this.#clock = options.clock ?? systemClock
    this.#modelsDir = options.modelsDir
    this.#targetDelayMs = options.targetDelayMs ?? ACK_TARGET_DELAY_MS
    this.#latestMs = options.latestMs ?? ACK_LATEST_MS
    this.#fallbackAfterMs = options.fallbackAfterMs ?? ACK_FALLBACK_AFTER_MS
    this.#deadlineMs = options.deadlineMs ?? ACK_DEADLINE_MS
    this.#ackOptions = {
      downloadMethod: options.downloadMethod ?? 'auto',
      ...(options.teeIdleTimeoutMs !== undefined ? { teeIdleTimeoutMs: options.teeIdleTimeoutMs } : {}),
      ...(options.teeMaxRetries !== undefined ? { teeMaxRetries: options.teeMaxRetries } : {}),
    }
    this.#log = options.onLog ?? (() => undefined)
  }

  on<K extends keyof AcknowledgerEvents>(
    event: K,
    listener: (payload: AcknowledgerEvents[K]) => void,
  ): () => void {
    return this.#emitter.on(event, listener)
  }

  /** One sweep. Safe to call as often as you like; it is idempotent per job. */
  async tick(): Promise<void> {
    for (const job of this.#store.list()) {
      if (!this.#needsAcknowledgement(job)) continue
      await this.#handle(job)
    }
  }

  #needsAcknowledgement(job: Job): boolean {
    if (job.state !== 'Delivered') return false
    if (job.acknowledgedAt !== undefined) return false
    if (job.deliveredAt === undefined) return false
    if (!job.taskId) return false
    return true
  }

  async #handle(job: Job): Promise<void> {
    const now = this.#clock.now()
    const deliveredAt = job.deliveredAt!

    // 1. Make sure the job has a schedule. This is what survives a restart.
    let scheduledAckAt = job.scheduledAckAt
    if (scheduledAckAt === undefined) {
      scheduledAckAt = this.#scheduleFor(deliveredAt)
      const updated = this.#store.update(job.id, { scheduledAckAt })
      this.#log(
        'info',
        `job ${job.id}: delivered, acknowledgement scheduled for ${new Date(scheduledAckAt).toISOString()} ` +
          `(${((this.#deadlineMs - (scheduledAckAt - deliveredAt)) / HOUR).toFixed(0)}h of margin)`,
      )
      this.#emitter.emit('scheduled', updated)
      job = updated
    }

    // 2. Is it time?
    const dueAt = Math.max(job.nextAckAttemptAt ?? 0, scheduledAckAt)
    if (now < dueAt) return

    const elapsed = now - deliveredAt

    // 3. Past the deadline entirely — nothing left to do but say so, once.
    if (elapsed > this.#deadlineMs) {
      if (!job.ackDeadlineMissed) {
        const updated = this.#store.update(job.id, {
          ackDeadlineMissed: true,
          error:
            `ACKNOWLEDGEMENT DEADLINE MISSED: more than 48 hours elapsed since delivery. ` +
            `The fine-tuned model is lost and 30% of the fee is forfeit. ` +
            `Last error: ${job.lastAckError ?? 'unknown'}`,
        })
        this.#log('error', `job ${job.id}: 48-hour acknowledgement deadline missed`)
        this.#emitter.emit('deadlineMissed', updated)
      }
      return
    }

    // 4. Always try the safe path first — download, verify, acknowledge in one call.
    //    The deprecated downloadModelFrom0GStorage/decryptModel pair is not even
    //    reachable from here: it is not on the port.
    const dataPath = join(this.#modelsDir, job.id)
    try {
      mkdirSync(dataPath, { recursive: true })
      await this.#broker.acknowledgeModel(job.provider, job.taskId!, dataPath, this.#ackOptions)
      this.#succeed(job, 'acknowledgeModel', { adapterPath: dataPath })
      return
    } catch (error) {
      const message = errorMessage(error)
      const attempts = job.ackAttempts + 1

      // 5. Near the deadline and still failing: save the queue even if the
      //    artifact is gone. This is the Bug #4 escape hatch used pre-emptively.
      if (elapsed >= this.#fallbackAfterMs) {
        try {
          await this.#broker.acknowledgeDeliverable(job.provider, job.taskId!)
          this.#succeed(job, 'acknowledgeDeliverable', {
            ackAttempts: attempts,
            lastAckError: message,
            artifactAtRisk: true,
            error:
              `ARTIFACT MAY BE LOST: acknowledgeModel failed ${attempts} time(s) and the 48-hour ` +
              `window was closing, so the deliverable was acknowledged on-chain WITHOUT downloading. ` +
              `The task queue for this provider is saved and the 30% penalty is avoided, but the ` +
              `fine-tuned model may no longer be retrievable. Last download error: ${message}`,
          })
          this.#log(
            'error',
            `job ${job.id}: fell back to acknowledgeDeliverable to save the queue — artifact may be lost`,
          )
          return
        } catch (fallbackError) {
          const patch: JobPatch = {
            ackAttempts: attempts,
            lastAckError: `acknowledgeModel: ${message}; acknowledgeDeliverable: ${errorMessage(fallbackError)}`,
            nextAckAttemptAt: this.#nextAttemptAt(now, attempts, deliveredAt),
          }
          const updated = this.#store.update(job.id, patch)
          this.#log('error', `job ${job.id}: both acknowledgement paths failed`)
          this.#emitter.emit('ackFailed', updated)
          return
        }
      }

      // 6. Plenty of time left: back off and try the good path again.
      const patch: JobPatch = {
        ackAttempts: attempts,
        lastAckError: message,
        nextAckAttemptAt: this.#nextAttemptAt(now, attempts, deliveredAt),
      }
      const updated = this.#store.update(job.id, patch)
      this.#log('warn', `job ${job.id}: acknowledgeModel attempt ${attempts} failed: ${message}`)
      this.#emitter.emit('ackFailed', updated)
    }
  }

  #succeed(job: Job, method: 'acknowledgeModel' | 'acknowledgeDeliverable', extra: JobPatch): void {
    const now = this.#clock.now()
    const patch: JobPatch = {
      acknowledgedAt: now,
      ackMethod: method,
      nextAckAttemptAt: undefined,
      ...extra,
    }
    if (canTransition(job.state, 'UserAcknowledged')) {
      patch.state = 'UserAcknowledged'
      patch.transitions = [...job.transitions, { state: 'UserAcknowledged', at: now }]
    }
    const updated = this.#store.update(job.id, patch)
    this.#log('info', `job ${job.id}: acknowledged via ${method}`)
    this.#emitter.emit('acknowledged', updated)
  }

  /** Target delay, clamped so we never schedule past the safety ceiling. */
  #scheduleFor(deliveredAt: number): number {
    const delay = Math.min(this.#targetDelayMs, this.#latestMs)
    return deliveredAt + delay
  }

  /**
   * Exponential backoff, capped, and never allowed to push the next attempt
   * past the point where we still have time to act.
   */
  #nextAttemptAt(now: number, attempts: number, deliveredAt: number): number {
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** (attempts - 1), BACKOFF_CAP_MS)
    const latestUseful = deliveredAt + this.#latestMs
    return Math.min(now + delay, Math.max(now, latestUseful))
  }
}
