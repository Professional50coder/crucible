import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

/**
 * `PassportManifest` is owned by `@crucible/core` (docs/INTERFACES.md §1). The
 * orchestrator only *serves* manifests, so it deliberately does not re-declare
 * the full shape — duplicating it would create a second source of truth that
 * could drift.
 */
export type PassportManifestLike = Record<string, unknown> & {
  task?: { id?: string }
}

/**
 * What `/passports` returns (INTERFACES.md §5).
 *
 * A bare manifest carries no id and no mint data, so a gallery built on it can
 * neither link to a passport page nor show a token number. Every `mint` field
 * may be `null`: `Passport.sol` is not deployed yet, so today `null` is the
 * correct answer everywhere, and the UI renders that as "not yet anchored"
 * rather than as an error.
 */
export interface PassportMint {
  tokenId: string | null
  contractAddress: string | null
  txHash: string | null
  owner: string | null
  mintedAt: string | null
}

export interface PassportRecord {
  id: string
  manifest: PassportManifestLike
  mint: PassportMint
  name?: string
  summary?: string
}

export interface PassportSource {
  list(): PassportRecord[]
  get(id: string): PassportRecord | undefined
}

const EMPTY_MINT: PassportMint = {
  tokenId: null,
  contractAddress: null,
  txHash: null,
  owner: null,
  mintedAt: null,
}

/**
 * Reads passports from a directory of `.json` files. Whatever mints them writes
 * them here; nothing needs a database.
 *
 * A file may be either a full `PassportRecord` (`{ manifest, mint, name… }`) or
 * a bare `PassportManifest`. The bare form is wrapped with an all-`null` mint,
 * so a manifest written before minting exists still serves correctly.
 */
export class DirectoryPassportSource implements PassportSource {
  readonly #dir: string

  constructor(dir: string) {
    this.#dir = dir
  }

  list(): PassportRecord[] {
    return this.#readAll().map((entry) => entry.record)
  }

  /** Resolvable by explicit id, by the manifest's task id, or by filename. */
  get(id: string): PassportRecord | undefined {
    return this.#readAll().find(
      ({ record, fileId }) =>
        record.id === id || record.manifest.task?.id === id || fileId === id,
    )?.record
  }

  #readAll(): Array<{ record: PassportRecord; fileId: string }> {
    if (!existsSync(this.#dir)) return []
    const out: Array<{ record: PassportRecord; fileId: string }> = []
    for (const name of readdirSync(this.#dir)) {
      if (!name.endsWith('.json')) continue
      const fileId = basename(name, '.json')
      const record = this.#read(join(this.#dir, name))
      if (record) out.push({ record, fileId })
    }
    return out
  }

  #read(path: string): PassportRecord | undefined {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    } catch {
      return undefined
    }
    if (typeof parsed !== 'object' || parsed === null) return undefined

    const fileId = basename(path, '.json')
    const wrapped = isRecordShape(parsed)
    const manifest = (wrapped ? parsed.manifest : parsed) as PassportManifestLike

    const record: PassportRecord = {
      id: asString(parsed.id) ?? manifest?.task?.id ?? fileId,
      manifest: manifest ?? {},
      // Fill in whatever the file omits, so the client always sees five keys.
      mint: { ...EMPTY_MINT, ...normalizeMint(parsed.mint) },
    }
    const name = asString(parsed.name)
    const summary = asString(parsed.summary)
    if (name !== undefined) record.name = name
    if (summary !== undefined) record.summary = summary
    return record
  }
}

function isRecordShape(value: Record<string, unknown>): boolean {
  return typeof value.manifest === 'object' && value.manifest !== null
}

function normalizeMint(value: unknown): Partial<PassportMint> {
  if (typeof value !== 'object' || value === null) return {}
  const raw = value as Record<string, unknown>
  const out: Partial<PassportMint> = {}
  for (const key of ['tokenId', 'contractAddress', 'txHash', 'owner', 'mintedAt'] as const) {
    const found = raw[key]
    if (found === undefined) continue
    out[key] = found === null ? null : String(found)
  }
  return out
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
