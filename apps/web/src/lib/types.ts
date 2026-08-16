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
 * Where the values on a record came from.
 *
 * `chain` — every hash, address and transaction on this record was produced by a
 *           real run against the live 0G network. Its explorer links resolve.
 * `demo`  — fixture data, shipped so the app is demonstrable without a funded
 *           wallet. Its dataset roots, adapter roots, task ids, token ids and
 *           transaction hashes are invented and have no on-chain counterpart.
 *
 * The distinction is load-bearing rather than cosmetic. A provenance page that
 * renders an invented hash next to a live explorer link teaches the reader that
 * the links are decorative, and the whole argument collapses. So a `demo` record
 * never renders an outbound link for a value that would 404, and says why.
 */
export type RecordProvenance = 'chain' | 'demo'

/**
 * What the adapter root hash on a passport actually is.
 *
 * `Passport.sol` rejects a zero adapter hash, so a run that reached `Delivered`
 * but whose adapter was never retrieved must anchor *something*. Crucible anchors
 * an explicit sentinel — `keccak256("crucible:adapter-not-retrieved:<taskId>")` —
 * chosen so that it is deliberately not a plausible root hash: anyone who
 * recomputes the preimage sees immediately that no adapter exists. That is the
 * honest encoding of a failure, and the UI must render it as one.
 */
export interface AdapterOrigin {
  kind: 'retrieved' | 'sentinel'
  /** The exact string hashed to produce a sentinel, so a reader can recompute it. */
  sentinelPreimage?: string
  /** Why the adapter was never retrieved. Shown verbatim. */
  reason?: string
  /**
   * sha256 of the artifact as it landed on disk.
   *
   * Distinct from the manifest's `adapter.rootHash`, which is 0G Storage's own
   * merkle root and is what the provider committed on chain. This is a plain
   * digest of the received bytes, so a holder of the file can confirm they have
   * the same one without reimplementing 0G's merkle scheme.
   */
  artifactSha256?: string
  /**
   * Which download path actually produced the artifact — `0g-storage` or `tee`
   * — and on what platform. Recorded because on this project the answer was the
   * entire difference between a retrieved model and a destroyed one.
   */
  retrievedVia?: string
}

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

  /** Defaults to `demo` when absent, because that is the safe assumption. */
  provenance?: RecordProvenance
  /**
   * The exact document whose keccak256 was anchored on chain, when it is known
   * byte-for-byte.
   *
   * The v1 `PassportManifest` above is what Crucible writes to 0G Storage. A
   * passport minted before that shape settled anchored a smaller document, and
   * the hash on chain commits to *that* document, not to this one. Carrying it
   * verbatim is what lets the page recompute the anchored hash in the reader's
   * browser and genuinely match, rather than asserting a match it cannot show.
   */
  anchoredManifest?: Record<string, unknown>
  /** What the adapter root hash is. Absent means a retrieved adapter. */
  adapterOrigin?: AdapterOrigin
  /**
   * Where the canonical manifest document itself lives on 0G Storage.
   *
   * This is what closes the verification loop: download the document at this
   * root hash, recompute its keccak256, and compare against the value the
   * contract returns. Without it a reader can only check the hash they were
   * handed, which proves nothing.
   */
  manifestStorage?: {
    rootHash: string
    /** Storage Scan submission sequence — its only human-readable route. */
    txSeq?: number
    uploadTx?: string
    sizeBytes?: number
  }
  /** ISO timestamp the task entered `Delivered`. Starts the 48-hour clock. */
  deliveredAt?: string
  /**
   * How the deliverable actually settled on chain, read from 0G's
   * FineTuningServing contract rather than from the provider's own progress
   * field.
   *
   * These are different facts and the difference is the whole point. A provider
   * reporting `progress: Finished` is reporting on its own work; whether the
   * deliverable was ever *acknowledged* is a separate on-chain value, and an
   * unacknowledged deliverable means the model is gone and 30% of the fee was
   * taken. A page that shows only the first number is telling a comfortable
   * half of the story.
   */
  settlement?: {
    /** `getDeliverables(...).acknowledged`. False means the artifact is lost. */
    acknowledged: boolean
    /** Neuron deducted as 0G's missed-acknowledgement penalty. */
    penaltyNeuron?: string
    /** What happened, in one sentence, rendered verbatim. */
    note?: string
  }
  /**
   * A caveat that must be read before the rest of the page. Rendered at the top,
   * not in a footnote — a passport that overstates itself is worse than none.
   */
  caveat?: { title: string; body: string }
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
  /** Drives the gallery's "verified on chain" band. Defaults to `demo`. */
  provenance: RecordProvenance
  /** `sentinel` means no adapter was ever retrieved for this run. */
  adapterKind: AdapterOrigin['kind']
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

  /**
   * The complete timestamped state history, oldest first, exactly as the
   * orchestrator sends it (`WireTransition` in `services/orchestrator/src/wire.ts`).
   *
   * This exists alongside `history` below because the two are not
   * interchangeable. `history` is a map keyed by state, so it cannot represent
   * the same state twice and its order depends on `TASK_STATES` rather than on
   * what happened. An array preserves both, which is what a timeline needs.
   *
   * Optional because a record predating the field, or a mock, simply omits it.
   */
  transitions?: { state: TaskState; at: string }[]
  /**
   * Acknowledged on-chain without a successful download, so the model may be
   * unrecoverable. Never silently dropped from a record.
   */
  artifactAtRisk?: boolean
  /**
   * The worst outcome in the system: the 48-hour window closed unacknowledged,
   * so the model is lost and 30% of the fee is forfeit.
   *
   * It is its own boolean because the only other way to read it over HTTP was
   * substring-matching the human-readable `error` text, which changes whenever
   * a message is reworded. Independent of `artifactAtRisk` — a fallback inside
   * the window risks the artifact without missing any deadline.
   */
  ackDeadlineMissed?: boolean

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
