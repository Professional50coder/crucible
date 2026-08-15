/**
 * The Model Passport — the artifact that makes a fine-tuned model *provable*.
 *
 * A 0G fine-tuning run leaves its evidence scattered across three systems: the
 * dataset and adapter live in 0G Storage under Merkle root hashes, the task and
 * its fee live on-chain, and the TEE attestation lives with the provider. Nothing
 * ties them together. Six months later, "which data trained this adapter, and did
 * it really run in a TEE?" is unanswerable.
 *
 * The passport is that missing tie: one manifest naming every input, every output
 * and every cost, reduced to a single keccak256 hash that can be published on-chain.
 * Anyone holding the manifest can recompute the hash and check it matches.
 *
 * That guarantee rests entirely on `canonicalize`. JSON has no canonical form —
 * `{"a":1,"b":2}` and `{"b":2,"a":1}` are the same object and different bytes. Two
 * honest parties would compute different hashes for identical content, and the whole
 * scheme collapses into noise. So we sort keys recursively and emit no whitespace,
 * which makes the encoding a pure function of the content.
 */

import { keccak256, toUtf8Bytes } from 'ethers'

import type { DatasetFormat } from './dataset.js'
import { type Network, NETWORKS, networkFor } from './networks.js'
import type { TaskState } from './task-state.js'
import { type TrainingConfig, validateTrainingConfig } from './training-config.js'

export interface PassportManifest {
  version: 1
  network: Network
  chainId: number
  /** ISO 8601, millisecond precision, always UTC. */
  createdAt: string
  task: {
    id: string
    provider: string
    state: TaskState
  }
  base: {
    model: string
    modelHash: string
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
  /**
   * Decimal neuron amounts as **strings**. Fees exceed Number.MAX_SAFE_INTEGER
   * (1 0G = 1e18 neuron) and `JSON.stringify` refuses to serialise a bigint, so a
   * bigint field would make the manifest unwritable and a number field would make
   * it silently wrong.
   */
  fee: {
    trainingNeuron: string
    storageReserveNeuron: string
    totalNeuron: string
  }
  tee: {
    signerAddress: string
    acknowledged: boolean
    attestationVerified: boolean
  }
}

/** Input to `buildManifest`. `version` and `chainId` are derived, never supplied. */
export interface PassportInput {
  network: Network
  /** Defaults to now. Supply it to rebuild a manifest whose hash must not change. */
  createdAt?: string
  task: PassportManifest['task']
  base: PassportManifest['base']
  dataset: PassportManifest['dataset']
  training: TrainingConfig
  adapter: PassportManifest['adapter']
  /** bigint is accepted for convenience — `estimateFee` returns bigints. Stored as strings. */
  fee: {
    trainingNeuron: bigint | string
    storageReserveNeuron: bigint | string
    totalNeuron: bigint | string
  }
  tee: PassportManifest['tee']
}

/**
 * Storage Scan hosts, per network. The mainnet and Galileo testnet explorers are
 * separate deployments — pointing a testnet root hash at the mainnet host returns
 * "not found", which reads as data loss rather than as a wrong URL.
 */
export const STORAGE_SCAN_URLS: Record<Network, string> = {
  testnet: 'https://storagescan-galileo.0g.ai',
  mainnet: 'https://storagescan.0g.ai',
}

export interface ExplorerLinks {
  storageDataset: string
  storageAdapter: string
  chainProvider: string
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Normalise a fee to a decimal string, rejecting anything that is not a whole neuron amount. */
function feeToString(value: bigint | string | undefined, field: string, errors: string[]): string {
  if (typeof value === 'bigint') return value.toString()

  if (typeof value !== 'string' || value.length === 0) {
    errors.push(`Missing required field "${field}". Pass the neuron amount from estimateFee().`)
    return ''
  }

  if (!/^-?\d+$/.test(value)) {
    errors.push(
      `Field "${field}" must be a decimal neuron amount, got "${value}". ` +
        `Use the bigint from estimateFee(), or its .toString() — not a 0G-denominated decimal.`,
    )
    return ''
  }

  return value
}

/**
 * Builds a validated manifest. Throws naming every field that is wrong, because a
 * passport is usually assembled at the end of a paid run — discovering a second
 * missing field after fixing the first wastes another round trip.
 */
export function buildManifest(input: PassportInput): PassportManifest {
  const errors: string[] = []

  const section = <K extends keyof PassportInput>(name: K): Record<string, unknown> => {
    const value = input?.[name]
    if (!isPlainObject(value)) {
      errors.push(`Missing required section "${String(name)}".`)
      return {}
    }
    return value
  }

  const task = section('task')
  const base = section('base')
  const dataset = section('dataset')
  const adapter = section('adapter')
  const fee = section('fee')
  const tee = section('tee')

  const str = (source: Record<string, unknown>, key: string, path: string): string => {
    const value = source[key]
    if (typeof value !== 'string' || value.length === 0) {
      errors.push(`Missing required field "${path}". It must be a non-empty string.`)
      return ''
    }
    return value
  }

  const num = (source: Record<string, unknown>, key: string, path: string): number => {
    const value = source[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push(`Missing required field "${path}". It must be a finite number.`)
      return 0
    }
    return value
  }

  const bool = (source: Record<string, unknown>, key: string, path: string): boolean => {
    const value = source[key]
    if (typeof value !== 'boolean') {
      errors.push(`Missing required field "${path}". It must be true or false.`)
      return false
    }
    return value
  }

  // Throws on its own with a message that already tells the user what to do.
  const network = networkFor(input?.network as string)

  const manifest: PassportManifest = {
    version: 1,
    network: network.name,
    chainId: network.chainId,
    createdAt: input?.createdAt ?? new Date().toISOString(),
    task: {
      id: str(task, 'id', 'task.id'),
      provider: str(task, 'provider', 'task.provider'),
      state: str(task, 'state', 'task.state') as TaskState,
    },
    base: {
      model: str(base, 'model', 'base.model'),
      modelHash: str(base, 'modelHash', 'base.modelHash'),
      tokenizer: str(base, 'tokenizer', 'base.tokenizer'),
    },
    dataset: {
      rootHash: str(dataset, 'rootHash', 'dataset.rootHash'),
      format: str(dataset, 'format', 'dataset.format') as DatasetFormat,
      exampleCount: num(dataset, 'exampleCount', 'dataset.exampleCount'),
      tokenCount: num(dataset, 'tokenCount', 'dataset.tokenCount'),
    },
    training: input?.training as TrainingConfig,
    adapter: {
      rootHash: str(adapter, 'rootHash', 'adapter.rootHash'),
    },
    fee: {
      trainingNeuron: feeToString(
        fee['trainingNeuron'] as bigint | string | undefined,
        'fee.trainingNeuron',
        errors,
      ),
      storageReserveNeuron: feeToString(
        fee['storageReserveNeuron'] as bigint | string | undefined,
        'fee.storageReserveNeuron',
        errors,
      ),
      totalNeuron: feeToString(
        fee['totalNeuron'] as bigint | string | undefined,
        'fee.totalNeuron',
        errors,
      ),
    },
    tee: {
      signerAddress: str(tee, 'signerAddress', 'tee.signerAddress'),
      acknowledged: bool(tee, 'acknowledged', 'tee.acknowledged'),
      attestationVerified: bool(tee, 'attestationVerified', 'tee.attestationVerified'),
    },
  }

  // Only set when known — an absent key and an `undefined` key must canonicalize
  // identically, and the cheapest way to guarantee that is never to write the key.
  const sizeBytes = adapter['sizeBytes']
  if (sizeBytes !== undefined) {
    manifest.adapter.sizeBytes = num(adapter, 'sizeBytes', 'adapter.sizeBytes')
  }

  if (!isPlainObject(input?.training)) {
    errors.push(`Missing required section "training". Pass the config the task was trained with.`)
  } else {
    // Re-checked here rather than trusted: a passport claiming a config 0G would
    // have rejected is a passport describing a run that never happened.
    errors.push(...validateTrainingConfig(input.training as unknown as Record<string, unknown>))
  }

  if (errors.length > 0) {
    throw new Error(`Cannot build passport manifest:\n  - ${errors.join('\n  - ')}`)
  }

  return manifest
}

/**
 * Recursively rebuild a value with object keys in ascending code-unit order.
 *
 * Also rejects the two value kinds that would quietly break the hash. `path` exists
 * only so those errors can name the offending field — a manifest is deeply nested
 * and "somewhere there is a bigint" is not a debuggable message.
 */
function sortValue(value: unknown, path: string): unknown {
  // JSON.stringify turns NaN and ±Infinity into `null` without complaint, so a
  // corrupted number would produce a valid-looking manifest with a wrong hash.
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(
      `Cannot canonicalize ${String(value)} at "${path}". ` +
        `JSON has no representation for it and would silently write null. Fix the value.`,
    )
  }

  // JSON.stringify throws "Do not know how to serialize a BigInt", which names no field.
  if (typeof value === 'bigint') {
    throw new Error(
      `Cannot canonicalize a bigint at "${path}". ` +
        `Manifest fee amounts are decimal strings — call .toString() on the bigint.`,
    )
  }

  // Arrays are ordered content: sort their elements' keys, never the elements.
  if (Array.isArray(value)) return value.map((item, i) => sortValue(item, `${path}[${i}]`))
  if (!isPlainObject(value)) return value

  const sorted: Record<string, unknown> = {}
  // Default sort is UTF-16 code-unit order — never localeCompare, which would make
  // the hash depend on the machine that computed it.
  for (const key of Object.keys(value).sort()) {
    const child = value[key]
    // Skip undefined so `{a:1,b:undefined}` and `{a:1}` agree. JSON.stringify would
    // drop it too, but doing it here keeps the rule explicit rather than incidental.
    if (child === undefined) continue
    sorted[key] = sortValue(child, path === '' ? key : `${path}.${key}`)
  }
  return sorted
}

/**
 * Deterministic JSON: keys sorted recursively, no whitespace. Two manifests with
 * identical content produce byte-identical output whatever order they were built in.
 * This is the only reason `manifestHash` means anything.
 */
export function canonicalize(manifest: PassportManifest): string {
  return JSON.stringify(sortValue(manifest, ''))
}

/** keccak256 of the canonical form — the value you publish on-chain. */
export function manifestHash(manifest: PassportManifest): string {
  return keccak256(toUtf8Bytes(canonicalize(manifest)))
}

/**
 * True when the manifest still hashes to `expectedHash`. Case-insensitive, since
 * hashes get copied out of block explorers that checksum-case them; never throws,
 * because a malformed hash is a failed verification, not a crash.
 */
export function verifyManifest(manifest: PassportManifest, expectedHash: string): boolean {
  return manifestHash(manifest).toLowerCase() === expectedHash.trim().toLowerCase()
}

/**
 * Storage Scan has no page keyed by root hash.
 *
 * `/file/<rootHash>` returns **404** — verified against the live Galileo explorer on
 * 2026-08-15. The human-readable page is `/submission/<txSeq>`, and a txSeq cannot be
 * derived from a root hash without asking the explorer first. The search box accepts a
 * sequence number or an address, not a root hash.
 *
 * The only route that *is* keyed by root hash is the explorer's JSON API, so that is what
 * we emit. It returns the submission list for the hash, including the txSeq needed to
 * build a `/submission/<txSeq>` link. A working JSON URL beats a pretty 404.
 */
export function storageLookupUrl(network: Network, rootHash: string): string {
  return `${STORAGE_SCAN_URLS[network]}/api/txs?skip=0&limit=10&rootHash=${rootHash}`
}

/** The human-readable Storage Scan page, once a submission sequence number is known. */
export function storageSubmissionUrl(network: Network, txSeq: number | string): string {
  return `${STORAGE_SCAN_URLS[network]}/submission/${txSeq}`
}

/** Everything in the manifest a human might want to click through and check for themselves. */
export function explorerLinks(manifest: PassportManifest): ExplorerLinks {
  const { explorerUrl } = NETWORKS[manifest.network]

  return {
    storageDataset: storageLookupUrl(manifest.network, manifest.dataset.rootHash),
    storageAdapter: storageLookupUrl(manifest.network, manifest.adapter.rootHash),
    chainProvider: `${explorerUrl}/address/${manifest.task.provider}`,
  }
}
