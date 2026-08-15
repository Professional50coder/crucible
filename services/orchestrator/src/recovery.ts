import { systemClock, type Clock } from './clock.js'
import { errorMessage, type FineTuningPort } from './broker.js'
import { normalizeState, canTransition } from './states.js'
import type { JobStore } from './store.js'
import type { JobPatch } from './types.js'

/**
 * ## Failure mode 2: "Bug #4" — the permanently locked deliverable queue
 *
 * From the May 2026 hackathon bug report, documented in the 0G SDK's own TSDoc:
 * a user retrieved their model through the deprecated
 * `downloadModelFrom0GStorage` + `decryptModel` path and never called
 * `acknowledgeModel`. Days later the artifact was garbage-collected from both
 * 0G Storage and the TEE buffer — and because `acknowledgeModel` requires a
 * successful download, it could no longer succeed at all. From that point every
 * `addDeliverable` for the same `(user, provider)` pair reverted with
 * "previous deliverable not acknowledged". The account could never fine-tune
 * again.
 *
 * The escape hatch is `acknowledgeDeliverable(provider, taskId)`, which
 * acknowledges on-chain without requiring the artifact. This module detects the
 * condition and exposes it as one call.
 *
 * Crucible itself can never *cause* this: the deprecated pair is not on
 * `FineTuningPort` at all. This exists to rescue accounts that arrived broken.
 */

export interface LockDetection {
  locked: boolean
  taskId?: string
  reason?: string
}

export interface UnlockResult {
  ok: true
  taskId: string
  /**
   * The SDK's `acknowledgeDeliverable` resolves to `void` — it does not return
   * a transaction hash — so this is always `null`. See README for the
   * divergence note against docs/INTERFACES.md.
   */
  txHash: string | null
  alreadyAcknowledged?: boolean
}

export interface QueueRecoveryOptions {
  store: JobStore
  broker: FineTuningPort
  clock?: Clock
  onLog?: (level: 'info' | 'warn' | 'error', message: string) => void
}

export class QueueRecovery {
  readonly #store: JobStore
  readonly #broker: FineTuningPort
  readonly #clock: Clock
  readonly #log: (level: 'info' | 'warn' | 'error', message: string) => void

  constructor(options: QueueRecoveryOptions) {
    this.#store = options.store
    this.#broker = options.broker
    this.#clock = options.clock ?? systemClock
    this.#log = options.onLog ?? (() => undefined)
  }

  /**
   * Is this (caller, provider) pair's queue blocked by an unacknowledged
   * deliverable? A task sitting at `Delivered` and never moving to
   * `UserAcknowledged` is exactly the fingerprint.
   */
  async detect(provider: string): Promise<LockDetection> {
    const tasks = await this.#broker.listTask(provider)
    const stuck = tasks.filter((task) => normalizeState(task.progress) === 'Delivered')
    if (stuck.length === 0) return { locked: false }

    const oldest = stuck.reduce((a, b) => (createdMs(a.createdAt) <= createdMs(b.createdAt) ? a : b))
    return {
      locked: true,
      ...(oldest.id ? { taskId: oldest.id } : {}),
      reason:
        'A deliverable is sitting at Delivered and was never acknowledged. Until it is, every new ' +
        'task for this provider will revert with "previous deliverable not acknowledged".',
    }
  }

  /**
   * Release the queue. Acknowledges on-chain WITHOUT downloading — the artifact
   * is usually already gone by the time anyone notices, and the queue matters
   * more than a model that no longer exists.
   */
  async unlock(provider: string, taskId?: string): Promise<UnlockResult> {
    let target = taskId
    if (!target) {
      const detection = await this.detect(provider)
      if (!detection.locked || !detection.taskId) {
        throw new Error(
          `No unacknowledged deliverable found for provider ${provider}. Nothing to unlock.`,
        )
      }
      target = detection.taskId
    }

    let alreadyAcknowledged = false
    try {
      await this.#broker.acknowledgeDeliverable(provider, target)
    } catch (error) {
      const message = errorMessage(error)
      if (/already acknowledged/i.test(message)) {
        // The queue is open; that is the outcome we wanted.
        alreadyAcknowledged = true
      } else {
        throw new Error(`Failed to unlock deliverable queue: ${message}`)
      }
    }

    this.#recordLocally(provider, target, alreadyAcknowledged)
    this.#log('warn', `unlocked deliverable queue for provider ${provider}, task ${target}`)

    return {
      ok: true,
      taskId: target,
      txHash: null,
      ...(alreadyAcknowledged ? { alreadyAcknowledged } : {}),
    }
  }

  #recordLocally(provider: string, taskId: string, alreadyAcknowledged: boolean): void {
    const job = this.#store
      .list()
      .find((j) => j.taskId === taskId && j.provider.toLowerCase() === provider.toLowerCase())
    if (!job) return

    const now = this.#clock.now()
    const patch: JobPatch = {
      acknowledgedAt: job.acknowledgedAt ?? now,
      ackMethod: 'acknowledgeDeliverable',
      artifactAtRisk: true,
      nextAckAttemptAt: undefined,
      error:
        `Deliverable queue unlocked: this task was acknowledged on-chain WITHOUT downloading the ` +
        `model (Bug #4 recovery). The provider queue is usable again and the 30% penalty is avoided, ` +
        `but the fine-tuned artifact may no longer be retrievable.` +
        (alreadyAcknowledged ? ' (It was already acknowledged on-chain.)' : ''),
    }
    if (canTransition(job.state, 'UserAcknowledged')) {
      patch.state = 'UserAcknowledged'
      patch.transitions = [...job.transitions, { state: 'UserAcknowledged', at: now }]
    }
    this.#store.update(job.id, patch)
  }
}

function createdMs(value: string | undefined): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}
