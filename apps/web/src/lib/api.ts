/**
 * The one seam between this app and everything outside it.
 *
 * No page, component or hook in this app calls `fetch` or touches fixture data
 * directly. They call these functions. That is the whole point: the orchestrator
 * (`services/orchestrator/`) is being written concurrently and does not exist
 * yet, so the app ships against an in-memory mock and swaps over by setting one
 * environment variable.
 *
 *   NEXT_PUBLIC_CRUCIBLE_API_URL unset  → mock mode (default; demos with no backend)
 *   NEXT_PUBLIC_CRUCIBLE_API_URL set    → live mode, hitting INTERFACES.md §5
 *
 * Paths and field names below match INTERFACES.md §5 exactly, so live mode needs
 * no translation layer.
 */

import {
  mockCreateJob,
  mockGetJob,
  mockGetLogs,
  mockGetPassport,
  mockListJobs,
  mockListPassports,
  mockListProviders,
  mockUnlockJob,
} from './mock/store'
import type {
  CreateJobRequest,
  HealthResult,
  Job,
  LogLine,
  Network,
  PassportFilter,
  PassportRecord,
  PassportSummary,
  ProviderInfo,
  UnlockResult,
} from './types'

/** INTERFACES.md §5 default base. */
export const DEFAULT_API_URL = 'http://localhost:8787'

const configured = process.env.NEXT_PUBLIC_CRUCIBLE_API_URL?.trim() ?? ''

export const API_BASE = configured
export const MOCK_MODE = configured === ''

/** Mock latency, so loading states are exercised rather than theoretical. */
const LATENCY_MS = 160

function delay<T>(value: T, ms = LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    let code: string | undefined
    try {
      const body = (await response.json()) as { error?: string; code?: string }
      if (body.error) message = body.error
      code = body.code
    } catch {
      // Non-JSON error body; the status line is all we have.
    }
    throw new ApiError(message, response.status, code)
  }

  return (await response.json()) as T
}

// ---------------------------------------------------------------------------
// Derivations shared by both modes
// ---------------------------------------------------------------------------

/** A passport's display name, when the record carries none. */
export function passportName(record: PassportRecord): string {
  return record.name ?? `${record.manifest.base.model} · ${record.manifest.task.id.slice(0, 8)}`
}

export function toSummary(record: PassportRecord): PassportSummary {
  const { manifest, mint } = record

  return {
    id: record.id,
    name: passportName(record),
    summary:
      record.summary ??
      `${manifest.dataset.exampleCount} examples · ${manifest.training.num_train_epochs} epochs on ${manifest.base.model}.`,
    network: manifest.network,
    model: manifest.base.model,
    createdAt: manifest.createdAt,
    exampleCount: manifest.dataset.exampleCount,
    tokenCount: manifest.dataset.tokenCount,
    adapterSizeBytes: manifest.adapter.sizeBytes,
    totalNeuron: manifest.fee.totalNeuron,
    mintStatus: mint.status,
    tokenId: mint.tokenId,
    attestationVerified: manifest.tee.attestationVerified,
    durationSeconds: record.durationSeconds,
    // Absent means demo: a record has to earn the claim that it is on chain.
    provenance: record.provenance ?? 'demo',
    adapterKind: record.adapterOrigin?.kind ?? 'retrieved',
  }
}

export function applyFilter(
  summaries: PassportSummary[],
  filter: PassportFilter = {},
): PassportSummary[] {
  const { network = 'all', model = 'all', query = '' } = filter
  const needle = query.trim().toLowerCase()

  return summaries.filter((item) => {
    if (network !== 'all' && item.network !== network) return false
    if (model !== 'all' && item.model !== model) return false
    if (needle === '') return true

    return (
      item.name.toLowerCase().includes(needle) ||
      item.summary.toLowerCase().includes(needle) ||
      item.model.toLowerCase().includes(needle) ||
      item.id.toLowerCase().includes(needle)
    )
  })
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export async function getHealth(): Promise<HealthResult> {
  if (MOCK_MODE) return delay({ ok: true, version: 'mock', mock: true }, 40)
  return request<HealthResult>('/health')
}

export async function listPassports(filter?: PassportFilter): Promise<PassportSummary[]> {
  const records = MOCK_MODE
    ? await delay(mockListPassports())
    : // §5 returns bare manifests; the mint half is read from chain per record.
      (await request<PassportRecord[]>('/passports'))

  return applyFilter(records.map(toSummary), filter)
}

export async function getPassport(id: string): Promise<PassportRecord | null> {
  if (MOCK_MODE) return delay(mockGetPassport(id))

  try {
    return await request<PassportRecord>(`/passports/${encodeURIComponent(id)}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/**
 * The other passport that is actually on chain, or `null` when there is none.
 *
 * Two passports exist on 0G Galileo. Same code, same wallet, same task — the
 * only variable that differed between them was the operating system, and one
 * lost its model to it while the other retrieved a 93,642,469-byte adapter.
 * That contrast is the strongest thing either record has to say, and it is only
 * legible if a reader can flip between the two without leaving the page, so the
 * passport page pairs each on-chain record with the other one.
 *
 * A demo record gets no sibling. Inviting a comparison between a real outcome
 * and an invented one would teach the reader that the records are
 * interchangeable, which is the opposite of what this page argues.
 */
export async function getSiblingPassport(
  record: PassportRecord,
): Promise<PassportRecord | null> {
  if ((record.provenance ?? 'demo') !== 'chain') return null

  const summaries = await listPassports()
  const sibling = summaries.find((item) => item.provenance === 'chain' && item.id !== record.id)
  return sibling ? await getPassport(sibling.id) : null
}

export async function listJobs(): Promise<Job[]> {
  if (MOCK_MODE) return delay(mockListJobs())
  return request<Job[]>('/jobs')
}

export async function getJob(id: string): Promise<Job | null> {
  if (MOCK_MODE) return delay(mockGetJob(id), 90)

  try {
    return await request<Job>(`/jobs/${encodeURIComponent(id)}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export async function getJobLogs(id: string): Promise<LogLine[]> {
  if (MOCK_MODE) return delay(mockGetLogs(id), 90)

  // §5: `GET /jobs/:id/logs` returns `{ logs: string }` — the raw provider log.
  const { logs } = await request<{ logs: string }>(`/jobs/${encodeURIComponent(id)}/logs`)
  return parseRawLogs(logs)
}

/** Turn the provider's raw log blob into lines the log panel can style. */
export function parseRawLogs(raw: string): LogLine[] {
  return raw
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const lower = line.toLowerCase()
      const level: LogLine['level'] = lower.includes('error')
        ? 'error'
        : lower.includes('warn')
          ? 'warn'
          : lower.includes('success') || lower.includes('complete')
            ? 'ok'
            : 'info'

      const match = line.match(/^\[?(\d{4}-\d{2}-\d{2}[T ][\d:.]+Z?)\]?\s*(.*)$/)
      return {
        ts: match ? new Date(match[1]!.replace(' ', 'T')).toISOString() : new Date().toISOString(),
        level,
        message: match ? match[2]! : line,
      }
    })
}

export async function createJob(input: CreateJobRequest): Promise<Job> {
  if (MOCK_MODE) {
    return delay(
      mockCreateJob({
        name: input.name,
        network: input.network,
        provider: input.provider,
        model: input.model,
        config: input.config,
        datasetRootHash: input.datasetRootHash,
        dataset: input.dataset,
      }),
      400,
    )
  }

  return request<Job>('/jobs', { method: 'POST', body: JSON.stringify(input) })
}

/** Bug #4 escape hatch. One click, for a deliverable queue already stranded. */
export async function unlockJob(id: string): Promise<UnlockResult> {
  if (MOCK_MODE) return delay(mockUnlockJob(id), 600)
  return request<UnlockResult>(`/jobs/${encodeURIComponent(id)}/unlock`, { method: 'POST' })
}

export async function listProviders(network?: Network): Promise<ProviderInfo[]> {
  const providers = MOCK_MODE
    ? await delay(mockListProviders(), 80)
    : await request<ProviderInfo[]>('/providers')

  return network ? providers.filter((p) => p.network === network) : providers
}

/*
 * There is no mint function here, and that is not an omission.
 *
 * This app never sends a mint transaction. Both passports on 0G Galileo were
 * minted by `contracts/scripts/mint-testnet-passport.js` and
 * `contracts/scripts/mint-run2-passport.js`, and the orchestrator serves no
 * mint route (`services/orchestrator/src/passports.ts` only reads records).
 * A `mintPassport()` used to sit here, called by nothing, describing a wagmi
 * flow and a daemon endpoint that neither existed — a stub that read as a
 * feature. The app renders mint state; it does not produce it.
 */
