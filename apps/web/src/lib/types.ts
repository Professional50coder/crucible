/**
 * The shapes the Crucible web app renders.
 *
 * Sections 1–5 of `docs/INTERFACES.md` are the source of truth for everything
 * shared between components. Where a type here carries fields that INTERFACES.md
 * does not define, those fields are marked and are optional, so a real response
 * from the orchestrator still satisfies the type. See apps/web/README.md for the
 * list of gaps this app would like closed.
 *
 * These are declared locally rather than imported from `@crucible/core` on
 * purpose: this app is standalone and must build and demo with no other package
 * present.
 */

export type Network = 'testnet' | 'mainnet'

/**
 * 0G's fine-tuning task lifecycle, in order (INTERFACES.md §2). Ordered, never
 * goes backwards, any state may go to `Failed`. `Delivered` starts the 48-hour
 * acknowledgement clock; `Finished` is the first point at which decryption
 * succeeds.
 */
export const TASK_STATES = [
  'Init',
  'SettingUp',
  'SetUp',
  'Training',
  'Trained',
  'Delivering',
  'Delivered',
  'UserAcknowledged',
  'Finished',
] as const

export type TaskState = (typeof TASK_STATES)[number] | 'Failed'

export type DatasetFormat = 'chat' | 'instruction' | 'text'

/** INTERFACES.md §3 — exactly five keys. 0G rejects extra *or* missing keys. */
export interface TrainingConfig {
  neftune_noise_alpha: number
  num_train_epochs: number
  per_device_train_batch_size: number
  learning_rate: number
  max_steps: number
}

/** Strings, not bigint — neuron amounts must survive JSON (INTERFACES.md §1). */
export interface FeeBreakdown {
  trainingNeuron: string
  storageReserveNeuron: string
  totalNeuron: string
}

/** INTERFACES.md §1. Frozen — do not extend without updating that file first. */
export interface PassportManifest {
  version: 1
  network: Network
  chainId: number
  /** ISO 8601. */
  createdAt: string
  task: {
    id: string
    provider: string
    state: TaskState
  }
  base: {
    /** No "Qwen/" prefix. */
    model: string
    /** The turbo hash. */
    modelHash: string
    /** With the "Qwen/" prefix. */
    tokenizer: string
  }
  dataset: {
    rootHash: string
    format: DatasetFormat
    exampleCount: number
    tokenCount: number
  }
  training: TrainingConfig
  adapter: {
    rootHash: string
    sizeBytes?: number
  }
  fee: FeeBreakdown
  tee: {
    signerAddress: string
    acknowledged: boolean
    attestationVerified: boolean
  }
}

export type MintStatus = 'minted' | 'pending' | 'unminted'

/**
 * The on-chain half of a passport — `Passport.sol`'s `PassportData` plus the
 * transaction that wrote it (INTERFACES.md §4). Read from chain via
 * `passportOf(tokenId)`; the web app never mints without a wallet.
 */
export interface PassportMint {
  status: MintStatus
  /** PUBLIC — verifiable without decryption. keccak256 of the canonical manifest. */
  manifestRootHash: string
  /** keccak256 of the canonical training config. */
  configHash?: string
  contractAddress?: string
  tokenId?: string
  txHash?: string
  owner?: string
  mintedAt?: string
  blockNumber?: number
}

export interface Hardware {
  gpu: string
  vcpu: number
  memoryGb: number
  storageGb: number
  tee: string
}

/**
 * What `/passports/:id` yields once the mint has been read from chain.
 *
 * INTERFACES.md §5 says `/passports/:id` returns a bare `PassportManifest`; the
 * mint half comes from `passportOf(tokenId)` on `Passport.sol`. This record is
 * the joined result, assembled in `api.ts` so pages consume one object.
 */
export interface PassportRecord {
  /** URL slug. Stable, short, and distinct from the 0G task id. */
  id: string
  manifest: PassportManifest
  mint: PassportMint
  /** UI decoration — not in INTERFACES.md. Falls back to a derived label. */
  name?: string
  summary?: string
  hardware?: Hardware
  /** Wall-clock training duration in seconds. Not in INTERFACES.md. */
  durationSeconds?: number
}

/** Flattened shape the gallery grid renders. Derived from a PassportRecord. */
export interface PassportSummary {
  id: string
  name: string
  summary: string
  network: Network
  model: string
  createdAt: string
  exampleCount: number
  tokenCount: number
  adapterSizeBytes?: number
  totalNeuron: string
  mintStatus: MintStatus
  tokenId?: string
  attestationVerified: boolean
  durationSeconds?: number
}

export interface PassportFilter {
  network?: Network | 'all'
  model?: string | 'all'
  query?: string
}

/**
 * INTERFACES.md §5 `Job`, verbatim, plus optional decoration.
 *
 * The required block is exactly what the orchestrator promises. Everything under
 * "UI extension" is absent from §5 today — the mock supplies it and every screen
 * degrades to a placeholder without it. See README for the ask.
 */
export interface Job {
  id: string
  network: Network
  provider: string
  taskId: string | null
  state: TaskState
  createdAt: string
  /** Starts the 48-hour clock. */
  deliveredAt: string | null
  acknowledgedAt: string | null
  /** When Crucible's daemon will act. The product's core promise, made visible. */
  acknowledgeScheduledFor: string | null
  datasetRootHash: string | null
  adapterPath: string | null
  error: string | null
  /** Provider `occupied` — a queued state, not an error. */
  queued: boolean

  // ---- UI extension: not in INTERFACES.md §5 ----
  /** Human label for the run. */
  name?: string
  chainId?: number
  model?: string
  config?: TrainingConfig
  fee?: FeeBreakdown
  dataset?: {
    filename?: string
    format?: DatasetFormat
    exampleCount?: number
    tokenCount?: number
  }
  adapterRootHash?: string
  adapterSizeBytes?: number
  hardware?: Hardware
  /** ISO timestamp for each state entered, for the timeline. */
  history?: Partial<Record<TaskState, string>>
  /** Set once a passport has been produced from this job. */
  passportId?: string
  /** Crucible's opinionated remediation for `error`. */
  errorHint?: string
  /** Position in the provider queue when `queued` is true. */
  queuePosition?: number
  updatedAt?: string
}

export interface JobSummary {
  id: string
  name: string
  network: Network
  model?: string
  state: TaskState
  createdAt: string
  passportId?: string
}

export type LogLevel = 'info' | 'warn' | 'error' | 'ok'

export interface LogLine {
  ts: string
  level: LogLevel
  message: string
}

export interface ProviderInfo {
  address: string
  network: Network
  url: string
  /** neuron per token, as a string. */
  pricePerTokenNeuron: string
  occupied: boolean
  models: string[]
  teeSignerAddress: string
  teeSignerAcknowledged: boolean
  hardware: Hardware
}

/** Body for `POST /jobs` (INTERFACES.md §5). */
export interface CreateJobRequest {
  network: Network
  provider: string
  model: string
  datasetRootHash?: string
  datasetPath?: string
  config: TrainingConfig
  // ---- UI extension: not in INTERFACES.md §5 ----
  name?: string
  dataset?: {
    filename?: string
    format?: DatasetFormat
    exampleCount?: number
    tokenCount?: number
  }
}

export interface UnlockResult {
  ok: boolean
  txHash: string
}

export interface MintResult {
  txHash: string
  tokenId: string
  contractAddress: string
}

export interface HealthResult {
  ok: boolean
  version: string
  /** Set by the mock so the UI can say plainly that it is not talking to a backend. */
  mock?: boolean
}
