/**
 * In-memory mock backend.
 *
 * The orchestrator (`services/orchestrator/`) does not exist yet, and the demo
 * must not depend on it existing. This module stands in for it: it holds jobs,
 * advances them through 0G's real ten-state lifecycle on a compressed clock, and
 * produces a passport when a run finishes.
 *
 * The clock is compressed and only the clock. Every rule it enforces is the real
 * one — `Delivered` opens a 48-hour window, acknowledgement is attempted about
 * two minutes after delivery, the provider takes one task at a time. A job you
 * launch here reaches `Delivered` in about a minute instead of twenty, and its
 * countdown then runs at true speed against a real 48-hour deadline.
 */

import { PRICE_PER_TOKEN_NEURON, estimateFee } from '../fee'
import { configHash, manifestHash } from '../manifest'
import type {
  Job,
  LogLine,
  PassportRecord,
  ProviderInfo,
  TaskState,
  TrainingConfig,
} from '../types'
import {
  BASE_MODEL_HASHES,
  HARDWARE,
  MAINNET_PROVIDER,
  MOCK_PASSPORT_CONTRACT,
  PROVIDERS,
  TESTNET_PROVIDER,
  TEE_SIGNER,
  TOKENIZERS,
  buildJobs,
  buildLogs,
  buildPassports,
} from './fixtures'

/** A state transition scheduled at `atMs` after the job's simulation anchor. */
type Step = readonly [TaskState, number]

const SECOND = 1_000
const MINUTE = 60 * SECOND

/**
 * Timeline for a job launched in the browser. Delivered at t+60s, then the
 * daemon's first acknowledgement attempt lands at delivered+2min, which is the
 * real policy — see `AUTO_ACK_SETTLE_MS`.
 */
const NEW_JOB_PLAN: Step[] = [
  ['Init', 0],
  ['SettingUp', 5 * SECOND],
  ['SetUp', 13 * SECOND],
  ['Training', 19 * SECOND],
  ['Trained', 47 * SECOND],
  ['Delivering', 53 * SECOND],
  ['Delivered', 60 * SECOND],
  ['UserAcknowledged', 60 * SECOND + 2 * MINUTE],
  ['Finished', 60 * SECOND + 2 * MINUTE + 15 * SECOND],
]

/**
 * Plans for the seeded jobs, anchored at store initialisation. `job_7f21c4` was
 * seeded as Delivered 90 seconds ago with acknowledgement scheduled 30 seconds
 * from load, so it acknowledges itself while you watch — which is the entire
 * pitch, demonstrated rather than described.
 */
const SEED_PLANS: Record<string, Step[]> = {
  job_7f21c4: [
    ['UserAcknowledged', 30 * SECOND],
    ['Finished', 45 * SECOND],
  ],
  job_2ad901: [
    ['Trained', 40 * SECOND],
    ['Delivering', 55 * SECOND],
    ['Delivered', 70 * SECOND],
    ['UserAcknowledged', 70 * SECOND + 2 * MINUTE],
    ['Finished', 70 * SECOND + 2 * MINUTE + 15 * SECOND],
  ],
  job_4e12aa: [
    ['SettingUp', 25 * SECOND],
    ['SetUp', 40 * SECOND],
    ['Training', 52 * SECOND],
  ],
}

interface Simulation {
  anchor: number
  plan: Step[]
}

interface MockState {
  initialisedAt: number
  jobs: Map<string, Job>
  logs: Map<string, LogLine[]>
  passports: Map<string, PassportRecord>
  simulations: Map<string, Simulation>
}

let state: MockState | null = null

/**
 * The store survives a page reload via sessionStorage.
 *
 * Without this, hard-loading a passport URL for a run you just watched finish
 * returns "not found" — which on a provenance page is the single worst thing it
 * could say. Persisting also keeps a 48-hour countdown running across reloads
 * rather than resetting it, which is the honest behaviour.
 *
 * Old state is discarded rather than resurrected: a session left open overnight
 * would otherwise reappear with an expired acknowledgement window.
 */
const STORAGE_KEY = 'crucible.mock.v1'
const MAX_STATE_AGE_MS = 2 * 60 * 60 * 1000

interface Persisted {
  initialisedAt: number
  jobs: Job[]
  logs: Array<[string, LogLine[]]>
  passports: PassportRecord[]
  simulations: Array<[string, Simulation]>
}

function restore(): MockState | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const saved = JSON.parse(raw) as Persisted
    if (
      typeof saved.initialisedAt !== 'number' ||
      Date.now() - saved.initialisedAt > MAX_STATE_AGE_MS
    ) {
      return null
    }

    return {
      initialisedAt: saved.initialisedAt,
      jobs: new Map(saved.jobs.map((job) => [job.id, job])),
      logs: new Map(saved.logs),
      passports: new Map(saved.passports.map((record) => [record.id, record])),
      simulations: new Map(saved.simulations),
    }
  } catch {
    // Corrupt or unavailable storage is not worth failing over — reseed.
    return null
  }
}

function persist(s: MockState): void {
  if (typeof window === 'undefined') return

  try {
    const payload: Persisted = {
      initialisedAt: s.initialisedAt,
      jobs: [...s.jobs.values()],
      logs: [...s.logs.entries()],
      passports: [...s.passports.values()],
      simulations: [...s.simulations.entries()],
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Quota exceeded or storage disabled. The in-memory store still works.
  }
}

function init(): MockState {
  const now = Date.now()

  const jobs = new Map<string, Job>()
  for (const job of buildJobs(now)) jobs.set(job.id, job)

  const logs = new Map<string, LogLine[]>()
  for (const [id, lines] of Object.entries(buildLogs(now))) logs.set(id, lines)

  const passports = new Map<string, PassportRecord>()
  for (const passport of buildPassports(now)) passports.set(passport.id, passport)

  const simulations = new Map<string, Simulation>()
  for (const [id, plan] of Object.entries(SEED_PLANS)) {
    if (jobs.has(id)) simulations.set(id, { anchor: now, plan })
  }

  return { initialisedAt: now, jobs, logs, passports, simulations }
}

function store(): MockState {
  if (state === null) {
    state = restore() ?? init()
    persist(state)
  }
  return state
}

/** Test hook — drops all simulated progress and reseeds from the fixtures. */
export function resetMockStore(): void {
  state = null
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // Nothing to do; the in-memory reset above is what matters.
    }
  }
}

// ---------------------------------------------------------------------------
// Deterministic fabricated hashes
// ---------------------------------------------------------------------------

/**
 * A stable 32-byte hex value derived from a string. Used for the hashes of jobs
 * created during a session, so that reloading a page does not change a hash the
 * viewer is looking at. FNV-1a, expanded — deliberately not a real digest, and
 * never presented as one.
 */
export function fabricatedHash(seed: string): string {
  let out = ''
  for (let round = 0; round < 8; round += 1) {
    let hash = 0x811c9dc5
    const input = `${seed}:${round}`
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    out += hash.toString(16).padStart(8, '0')
  }
  return `0x${out}`
}

function fabricatedTokenId(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return String(20 + (hash % 900))
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

/** The last planned step whose time has passed, if any. */
function currentStep(plan: Step[], elapsed: number): Step | undefined {
  let reached: Step | undefined
  for (const step of plan) {
    if (step[1] <= elapsed) reached = step
    else break
  }
  return reached
}

const ACK_SETTLE_MS = 2 * MINUTE

function advance(job: Job, sim: Simulation, now: number): Job {
  const elapsed = now - sim.anchor
  const step = currentStep(sim.plan, elapsed)
  if (!step) return job

  const [state_, atMs] = step
  if (state_ === job.state) return job

  const history = { ...(job.history ?? {}) }
  // Backfill every step the job has passed through, so the timeline is complete
  // even if nothing was polling while it advanced.
  for (const [planned, plannedAt] of sim.plan) {
    if (plannedAt <= elapsed && !history[planned]) {
      history[planned] = new Date(sim.anchor + plannedAt).toISOString()
    }
  }

  const next: Job = {
    ...job,
    state: state_,
    history,
    updatedAt: new Date(sim.anchor + atMs).toISOString(),
  }

  if (state_ !== 'Init' && next.queued) {
    next.queued = false
    next.queuePosition = undefined
  }

  const deliveredIso = history['Delivered']
  if (deliveredIso && !next.deliveredAt) {
    next.deliveredAt = deliveredIso
    next.acknowledgeScheduledFor = new Date(
      new Date(deliveredIso).getTime() + ACK_SETTLE_MS,
    ).toISOString()
  }

  const acknowledgedIso = history['UserAcknowledged']
  if (acknowledgedIso && !next.acknowledgedAt) {
    next.acknowledgedAt = acknowledgedIso
  }

  if (!next.adapterRootHash && (state_ === 'Delivering' || currentIsAtOrPast(state_, 'Delivering'))) {
    next.adapterRootHash = fabricatedHash(`${job.id}:adapter`)
    next.adapterSizeBytes = job.model === 'Qwen3-32B' ? 943_718_400 : 104_857_600
  }

  if (state_ === 'Finished') {
    next.adapterPath = `~/.crucible/adapters/${job.name ?? job.id}`
    if (!next.passportId) {
      next.passportId = passportFromJob(next).id
    }
  }

  return next
}

const ORDER: TaskState[] = [
  'Init',
  'SettingUp',
  'SetUp',
  'Training',
  'Trained',
  'Delivering',
  'Delivered',
  'UserAcknowledged',
  'Finished',
]

function currentIsAtOrPast(current: TaskState, target: TaskState): boolean {
  return ORDER.indexOf(current) >= ORDER.indexOf(target)
}

/** Mint a passport for a finished job and file it in the gallery. */
function passportFromJob(job: Job): PassportRecord {
  const s = store()
  const id = `p-${job.id.replace(/^job_/, '')}`

  const existing = s.passports.get(id)
  if (existing) return existing

  const model = job.model ?? 'Qwen2.5-0.5B-Instruct'
  const network = job.network
  const finishedAt = job.history?.['Finished'] ?? new Date().toISOString()

  const manifest: PassportRecord['manifest'] = {
      version: 1,
      network,
      chainId: network === 'mainnet' ? 16661 : 16602,
      createdAt: finishedAt,
      task: {
        id: job.taskId ?? fabricatedHash(`${job.id}:task`).slice(2, 34),
        provider: job.provider,
        state: 'Finished',
      },
      base: {
        model,
        modelHash: BASE_MODEL_HASHES[model] ?? BASE_MODEL_HASHES['Qwen2.5-0.5B-Instruct']!,
        tokenizer: TOKENIZERS[model] ?? TOKENIZERS['Qwen2.5-0.5B-Instruct']!,
      },
      dataset: {
        rootHash: job.datasetRootHash ?? fabricatedHash(`${job.id}:dataset`),
        format: job.dataset?.format ?? 'chat',
        exampleCount: job.dataset?.exampleCount ?? 0,
        tokenCount: job.dataset?.tokenCount ?? 0,
      },
      training: job.config ?? ({
        neftune_noise_alpha: 5,
        num_train_epochs: 3,
        per_device_train_batch_size: 2,
        learning_rate: 0.0002,
        max_steps: 45,
      } satisfies TrainingConfig),
      adapter: {
        rootHash: job.adapterRootHash ?? fabricatedHash(`${job.id}:adapter`),
        sizeBytes: job.adapterSizeBytes ?? 104_857_600,
      },
      fee: job.fee ?? {
        trainingNeuron: '0',
        storageReserveNeuron: '0',
        totalNeuron: '0',
      },
      tee: {
        signerAddress: TEE_SIGNER,
        acknowledged: true,
        attestationVerified: true,
      },
  }

  const record: PassportRecord = {
    id,
    // Simulated in this browser, so it is a demo record no matter how real the
    // run felt to watch. Nothing here has an on-chain counterpart.
    provenance: 'demo',
    name: job.name ?? job.id,
    summary: `Fine-tuned on ${job.dataset?.exampleCount ?? 0} examples from ${
      job.dataset?.filename ?? 'an uploaded dataset'
    }. Minted by Crucible the moment the run settled.`,
    manifest,
    mint: {
      status: 'minted',
      manifestRootHash: manifestHash(manifest),
      configHash: configHash(manifest.training),
      contractAddress: MOCK_PASSPORT_CONTRACT,
      tokenId: fabricatedTokenId(job.id),
      txHash: fabricatedHash(`${job.id}:mint`),
      owner: '0x3De9a1f0B4c72E85A1d6F09b3c47E2185aD0C9f4',
      mintedAt: finishedAt,
      blockNumber: 4_900_000 + (Number(fabricatedTokenId(job.id)) % 9_000),
    },
    hardware: HARDWARE,
    durationSeconds: 1_180,
  }

  s.passports.set(id, record)
  persist(s)
  return record
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function syncAll(now = Date.now()): void {
  const s = store()
  let changed = false

  for (const [id, sim] of s.simulations) {
    const job = s.jobs.get(id)
    if (!job) continue
    const next = advance(job, sim, now)
    if (next !== job) {
      s.jobs.set(id, next)
      changed = true
    }
  }

  if (changed) persist(s)
}

export function mockListJobs(): Job[] {
  syncAll()
  return [...store().jobs.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
}

export function mockGetJob(id: string): Job | null {
  syncAll()
  return store().jobs.get(id) ?? null
}

export function mockGetLogs(id: string): LogLine[] {
  syncAll()
  const s = store()
  const base = s.logs.get(id) ?? []
  const job = s.jobs.get(id)
  if (!job) return base

  // Derive log lines for anything the simulator has advanced past, so the log
  // and the state machine never disagree.
  //
  // Dedupe on the timestamp, not the message: a seeded log line and a derived
  // one for the same transition say the same thing in different words, and
  // matching on text would let both through.
  const derived: LogLine[] = []
  const covered = new Set(base.map((line) => line.ts))

  const add = (state_: TaskState, level: LogLine['level'], message: string) => {
    const ts = job.history?.[state_]
    if (!ts || covered.has(ts)) return
    covered.add(ts)
    derived.push({ ts, level, message })
  }

  add('SettingUp', 'info', 'Provider pulling base model and dataset from 0G Storage')
  add('SetUp', 'ok', 'Environment ready — dataset hash verified against the on-chain root hash')
  add('Training', 'info', 'Training started inside the TEE')
  add('Trained', 'ok', 'Training complete — LoRA adapter produced')
  add('Delivering', 'info', 'Encrypting and writing adapter to 0G Storage')
  add('Delivered', 'warn', 'Delivered. 48-hour acknowledgement window open.')
  add('UserAcknowledged', 'ok', 'acknowledgeModel succeeded — hash verified, deliverable acknowledged')
  add('Finished', 'ok', 'Finished. Passport manifest written to 0G Storage and minted.')

  return [...base, ...derived].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
  )
}

export function mockListPassports(): PassportRecord[] {
  syncAll()
  return [...store().passports.values()].sort(
    (a, b) =>
      new Date(b.manifest.createdAt).getTime() - new Date(a.manifest.createdAt).getTime(),
  )
}

export function mockGetPassport(id: string): PassportRecord | null {
  syncAll()
  return store().passports.get(id) ?? null
}

export function mockListProviders(): ProviderInfo[] {
  return PROVIDERS
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

let created = 0

export function mockCreateJob(input: {
  name?: string
  network: 'testnet' | 'mainnet'
  provider: string
  model: string
  config: TrainingConfig
  datasetRootHash?: string
  dataset?: Job['dataset']
}): Job {
  const s = store()
  const now = Date.now()

  created += 1
  const id = `job_${fabricatedHash(`created:${now}:${created}`).slice(2, 8)}`

  const provider =
    input.provider || (input.network === 'mainnet' ? MAINNET_PROVIDER : TESTNET_PROVIDER)

  // A provider takes one task at a time. If one is already running, the new job
  // is queued — a first-class state, not an error.
  const busy = [...s.jobs.values()].some(
    (job) =>
      job.network === input.network &&
      !['Finished', 'Failed', 'Delivered', 'UserAcknowledged'].includes(job.state) &&
      !job.queued,
  )

  const job: Job = {
    id,
    name: input.name || `run-${id.slice(4)}`,
    network: input.network,
    chainId: input.network === 'mainnet' ? 16661 : 16602,
    provider,
    taskId: fabricatedHash(`${id}:task`).slice(2, 10) + '-' + fabricatedHash(id).slice(2, 6),
    state: 'Init',
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    deliveredAt: null,
    acknowledgedAt: null,
    acknowledgeScheduledFor: null,
    datasetRootHash: input.datasetRootHash ?? fabricatedHash(`${id}:dataset`),
    adapterPath: null,
    error: null,
    queued: busy,
    queuePosition: busy ? 1 : undefined,
    model: input.model,
    config: input.config,
    // The orchestrator computes the real fee when it creates the task; the
    // browser's estimate is not authoritative, so the job carries its own.
    fee: estimateFee({
      tokenCount: input.dataset?.tokenCount ?? 0,
      epochs: input.config.num_train_epochs,
      pricePerTokenNeuron: PRICE_PER_TOKEN_NEURON[input.network]!,
      model: input.model,
    }),
    dataset: input.dataset,
    hardware: HARDWARE,
    history: { Init: new Date(now).toISOString() },
  }

  s.jobs.set(id, job)
  s.logs.set(id, [
    { ts: job.createdAt, level: 'info', message: 'Funding fine-tuning sub-account (--service fine-tuning)' },
    { ts: job.createdAt, level: 'ok', message: 'Balance verified before task creation' },
    { ts: job.createdAt, level: 'info', message: `Dataset uploaded to 0G Storage — ${input.dataset?.exampleCount ?? 0} examples` },
    ...(busy
      ? ([
          {
            ts: job.createdAt,
            level: 'warn',
            message: 'Provider occupied — one task at a time on this network. Queued.',
          },
        ] as LogLine[])
      : []),
  ])

  // A queued job waits 20 seconds for the provider before starting.
  const offset = busy ? 20 * SECOND : 0
  s.simulations.set(id, { anchor: now + offset, plan: NEW_JOB_PLAN })

  persist(s)
  return job
}

/** Bug #4 escape hatch — `acknowledgeDeliverable` on an already-stuck queue. */
export function mockUnlockJob(id: string): { ok: boolean; txHash: string } {
  const s = store()
  const job = s.jobs.get(id)
  const txHash = fabricatedHash(`${id}:unlock`)

  if (job) {
    s.logs.set(id, [
      ...(s.logs.get(id) ?? []),
      {
        ts: new Date().toISOString(),
        level: 'ok',
        message: `acknowledgeDeliverable sent — deliverable queue unlocked (${txHash.slice(0, 10)}…)`,
      },
    ])
    persist(s)
  }

  return { ok: true, txHash }
}
