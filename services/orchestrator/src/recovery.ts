import { join } from 'node:path'
import { systemClock, type Clock } from './clock.js'
import { errorMessage, type FineTuningPort } from './broker.js'
import { type ModelRetriever } from './retrieval.js'
import { normalizeState, canTransition } from './states.js'
import type { JobStore } from './store.js'
import type { AdapterHashSource, JobPatch } from './types.js'

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

/**
 * The outcome of retrieving a real artifact for a run that had failed, and
 * upgrading its passport in place from a sentinel to an on-chain-verified root.
 */
export interface UpgradeResult {
  ok: true
  jobId: string
  taskId: string
  /** The validated on-chain model root now recorded on the job. */
  adapterRootHash: string
  adapterHashSource: 'onchain-verified'
  sizeBytes: number
  /** Provenance the job carried before this call — `null` if it had none. */
  previousHashSource: AdapterHashSource | null
  /** True when the job had been recorded as a sentinel/at-risk loss before now. */
  upgraded: boolean
}

export interface QueueRecoveryOptions {
  store: JobStore
  broker: FineTuningPort
  clock?: Clock
  /** Root directory for downloaded adapters; required for the retrieve-and-upgrade flow. */
  modelsDir?: string
  /** The Windows-safe HTTP retriever; required for the retrieve-and-upgrade flow. */
  retriever?: ModelRetriever
  onLog?: (level: 'info' | 'warn' | 'error', message: string) => void
}

export class QueueRecovery {
  readonly #store: JobStore
  readonly #broker: FineTuningPort
  readonly #clock: Clock
  readonly #modelsDir?: string
  readonly #retriever?: ModelRetriever
  readonly #log: (level: 'info' | 'warn' | 'error', message: string) => void

  constructor(options: QueueRecoveryOptions) {
    this.#store = options.store
    this.#broker = options.broker
    this.#clock = options.clock ?? systemClock
    this.#modelsDir = options.modelsDir
    this.#retriever = options.retriever
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

  /**
   * ## Failure mode 3: a failed run made whole
   *
   * A run whose retrieval or acknowledgement failed is not a dead end. Once the
   * artifact is available again — the Windows-safe HTTP path works even where the
   * SDK could not reach it — this retrieves it, validates its bytes against the
   * provider's on-chain model root, releases the queue if it was not already
   * acknowledged, and UPGRADES THE EXISTING JOB IN PLACE from a sentinel to an
   * `onchain-verified` root.
   *
   * It never creates a second job: there is exactly one record per run, so there
   * can never be a confused second passport. Re-running it once a job is already
   * `onchain-verified` is a no-op success (idempotent).
   */
  async retrieveAndUpgrade(jobId: string): Promise<UpgradeResult> {
    if (!this.#retriever || !this.#modelsDir) {
      throw new Error(
        'Recovery is not configured for artifact retrieval: no HTTP retriever/modelsDir. ' +
          'Construct the orchestrator with a retriever to enable passport upgrades.',
      )
    }

    const job = this.#store.get(jobId)
    if (!job) throw new Error(`No such job: ${jobId}`)
    if (!job.taskId) {
      throw new Error(`Job ${jobId} has no on-chain task; there is nothing to retrieve.`)
    }

    const previousHashSource = job.adapterHashSource ?? null

    // Already whole: nothing to do, and definitely no second passport.
    if (job.adapterHashSource === 'onchain-verified' && job.adapterRootHash) {
      return {
        ok: true,
        jobId,
        taskId: job.taskId,
        adapterRootHash: job.adapterRootHash,
        adapterHashSource: 'onchain-verified',
        sizeBytes: 0,
        previousHashSource,
        upgraded: false,
      }
    }

    const deliverable = await this.#broker.getDeliverable(job.provider, job.taskId)
    if (!deliverable) {
      throw new Error(
        `No on-chain deliverable for task ${job.taskId}. The provider may have settled and cleared ` +
          `it, in which case the artifact is unrecoverable and the sentinel stands.`,
      )
    }

    const dataPath = join(this.#modelsDir, job.id)
    const result = await this.#retriever.retrieve({
      network: job.network,
      rootHash: deliverable.modelRootHash,
      destPath: join(dataPath, 'model.bin'),
    })

    // Release the queue on-chain only if it has not already been acknowledged
    // (e.g. by the earlier acknowledgeDeliverable fallback). Acknowledging twice
    // reverts, so we guard on the chain's own view.
    if (!deliverable.acknowledged) {
      await this.#broker.acknowledgeDeliverable(job.provider, job.taskId)
    }

    const now = this.#clock.now()
    const patch: JobPatch = {
      adapterPath: dataPath,
      adapterRootHash: deliverable.modelRootHash,
      adapterHashSource: 'onchain-verified',
      artifactAtRisk: false,
      acknowledgedAt: job.acknowledgedAt ?? now,
      ackMethod: 'acknowledgeModel',
      nextAckAttemptAt: undefined,
      lastAckError: undefined,
      error: undefined,
    }
    if (canTransition(job.state, 'UserAcknowledged')) {
      patch.state = 'UserAcknowledged'
      patch.transitions = [...job.transitions, { state: 'UserAcknowledged', at: now }]
    }
    this.#store.update(job.id, patch)

    const upgraded = previousHashSource === 'sentinel' || Boolean(job.artifactAtRisk)
    this.#log(
      'info',
      `job ${job.id}: passport upgraded to onchain-verified root ${deliverable.modelRootHash} ` +
        `(${result.sizeBytes} bytes)${upgraded ? ' — was a sentinel' : ''}`,
    )

    return {
      ok: true,
      jobId,
      taskId: job.taskId,
      adapterRootHash: deliverable.modelRootHash,
      adapterHashSource: 'onchain-verified',
      sizeBytes: result.sizeBytes,
      previousHashSource,
      upgraded,
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
      // No download happened, so the adapter hash stands for nothing. Marked as a
      // sentinel so `retrieveAndUpgrade` can later replace it with the real root.
      adapterHashSource: 'sentinel',
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
