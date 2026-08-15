import type { TaskState } from './states.js'

export type NetworkName = 'testnet' | 'mainnet'

export type AckMethod = 'acknowledgeModel' | 'acknowledgeDeliverable'

export interface StateTransition {
  state: TaskState
  at: number
}

/**
 * One fine-tuning job, as Crucible tracks it. Everything needed to resume
 * unattended work after a restart lives in this record — there is no
 * scheduling state held only in memory.
 */
/** Exactly the five parameters 0G accepts. Owned by `@crucible/core`; mirrored here. */
export interface TrainingConfig {
  neftune_noise_alpha: number
  num_train_epochs: number
  per_device_train_batch_size: number
  learning_rate: number
  max_steps: number
}

/**
 * Fee figures as STRINGS. They are neuron amounts up to ~1e18, which exceeds
 * `Number.MAX_SAFE_INTEGER`, and `bigint` cannot be JSON-serialised at all —
 * so they are carried as decimal strings from the moment they are computed.
 */
export interface JobFee {
  trainingNeuron: string
  storageReserveNeuron: string
  totalNeuron: string
}

export interface JobDataset {
  format: 'chat' | 'instruction' | 'text'
  exampleCount: number
  /** Estimate. 0G counts tokens itself with its own tokenizer. */
  tokenCount: number
}

export interface Job {
  id: string
  network: NetworkName
  provider: string
  /** Assigned once the task exists on-chain. Absent while a job is queued. */
  taskId?: string
  model?: string
  datasetRootHash?: string
  /** Local dataset to upload, when a root hash was not supplied. */
  datasetPath?: string
  trainingConfig?: TrainingConfig
  /** Estimated cost, computed at submission from the provider's live price. */
  fee?: JobFee
  /** Format/size summary, supplied by the caller or derived from the file. */
  dataset?: JobDataset

  /** Submission (upload + createTask) retry bookkeeping. */
  submitAttempts: number
  nextSubmitAttemptAt?: number
  lastSubmitError?: string

  state: TaskState
  transitions: StateTransition[]

  /** True when the single fine-tuning provider is busy with someone else's task. */
  providerOccupied: boolean

  /** When the provider reported `Delivered`. The 48-hour clock starts here. */
  deliveredAt?: number
  /** When we intend to acknowledge. Always well inside the window. */
  scheduledAckAt?: number
  /** When acknowledgement actually succeeded. */
  acknowledgedAt?: number
  ackMethod?: AckMethod
  ackAttempts: number
  nextAckAttemptAt?: number
  lastAckError?: string
  /**
   * Set when we had to fall back to `acknowledgeDeliverable` to save the queue.
   * The deliverable is released but the artifact may be unrecoverable.
   */
  artifactAtRisk?: boolean
  /** Set when the deadline passed with no successful acknowledgement at all. */
  ackDeadlineMissed?: boolean

  /** Where the decrypted/downloaded adapter was written. */
  adapterPath?: string
  /** Last training log fetched from the provider. */
  log?: string
  logFetchedAt?: number

  error?: string
  createdAt: number
  updatedAt: number
}

export interface CreateJobInput {
  network: NetworkName
  provider: string
  model?: string
  datasetRootHash?: string
  datasetPath?: string
  trainingConfig?: TrainingConfig
  dataset?: JobDataset
  taskId?: string
  adapterPath?: string
  /** Pre-set state, used when adopting a task that is already running. */
  state?: TaskState
}

export type JobPatch = Partial<Omit<Job, 'id' | 'createdAt'>>
