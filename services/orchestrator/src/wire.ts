import type { TaskState } from './states.js'
import type { Job, JobDataset, JobFee, NetworkName, TrainingConfig } from './types.js'

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
