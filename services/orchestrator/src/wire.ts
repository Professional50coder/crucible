import type { TaskState } from './states.js'
import type { Job, JobDataset, JobFee, NetworkName, TrainingConfig } from './types.js'

/** One entry of the job's state history, with the timestamp as an ISO string. */
export interface WireTransition {
  state: TaskState
  at: string
}

/**
 * The Job shape sent over HTTP.
 *
 * Fixed by `docs/INTERFACES.md` section 5 — the web app is coded against this,
 * so the internal `Job` record is free to change but this is not. Two
 * conventions matter to the client:
 *   - timestamps are ISO 8601 strings, never epoch numbers
 *   - absent values are `null`, never missing keys or `undefined`
 */
export interface WireJob {
  id: string
  network: NetworkName
  provider: string
  taskId: string | null
  state: TaskState
  createdAt: string
  deliveredAt: string | null
  acknowledgedAt: string | null
  /** When Crucible will act — the number the 48-hour countdown reassures against. */
  acknowledgeScheduledFor: string | null
  datasetRootHash: string | null
  adapterPath: string | null
  error: string | null
  /** The provider is `occupied`. A normal waiting state, never an error. */
  queued: boolean
  /**
   * Extension beyond the spec: set when the deliverable was acknowledged
   * on-chain without a successful download, so the model may be unrecoverable.
   * The UI can ignore it; it must never be silently dropped from the record.
   */
  artifactAtRisk: boolean
  /**
   * The worst outcome in the system: the 48-hour window closed with no
   * successful acknowledgement, so the model is lost and 30% of the fee is
   * forfeit. `Job.ackDeadlineMissed` has always recorded it, but until now the
   * only way to read it over HTTP was substring-matching the human-readable
   * `error` text — which changes whenever we reword a message. The one signal
   * that most needs to be reliable gets its own boolean.
   *
   * Independent of `artifactAtRisk`: a fallback to `acknowledgeDeliverable`
   * inside the window puts the artifact at risk but misses no deadline.
   */
  ackDeadlineMissed: boolean
  /**
   * The complete timestamped state history, oldest first, as appended by the
   * poller and the acknowledger. Without it a client can render the current
   * state but not when anything happened — no timeline, and no way to show how
   * long a job actually sat at `Delivered` before we acted.
   */
  transitions: WireTransition[]

  // ── Added 2026-08-14 (INTERFACES.md §5). The job page's Config, Fee and
  //    Dataset panels render these. All optional: a job submitted without them
  //    simply omits the key, and older responses stay valid.
  model?: string
  config?: TrainingConfig
  /** Strings, never bigint — they must survive the JSON hop. */
  fee?: JobFee
  dataset?: JobDataset
}

export function toWireJob(job: Job): WireJob {
  return {
    id: job.id,
    network: job.network,
    provider: job.provider,
    taskId: job.taskId ?? null,
    state: job.state,
    createdAt: iso(job.createdAt)!,
    deliveredAt: iso(job.deliveredAt),
    acknowledgedAt: iso(job.acknowledgedAt),
    acknowledgeScheduledFor: iso(job.scheduledAckAt),
    datasetRootHash: job.datasetRootHash ?? null,
    adapterPath: job.adapterPath ?? null,
    error: job.error ?? null,
    queued: Boolean(job.providerOccupied),
    artifactAtRisk: Boolean(job.artifactAtRisk),
    ackDeadlineMissed: Boolean(job.ackDeadlineMissed),
    // Same ISO convention as every other timestamp on the wire. A record
    // written before transitions were tracked has no array at all, so default
    // to empty rather than emitting `undefined` — absent history is "nothing
    // recorded", never a missing key.
    transitions: (job.transitions ?? []).map((transition) => ({
      state: transition.state,
      at: iso(transition.at)!,
    })),
    // Spread-omit: the spec declares these optional, so an absent value means
    // an absent key rather than an explicit null.
    ...(job.model !== undefined ? { model: job.model } : {}),
    ...(job.trainingConfig !== undefined ? { config: job.trainingConfig } : {}),
    ...(job.fee !== undefined ? { fee: job.fee } : {}),
    ...(job.dataset !== undefined ? { dataset: job.dataset } : {}),
  }
}

function iso(ms: number | undefined): string | null {
  if (ms === undefined || ms === null || !Number.isFinite(ms)) return null
  return new Date(ms).toISOString()
}
