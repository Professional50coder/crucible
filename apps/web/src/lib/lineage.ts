/**
 * The lineage graph, derived from a passport record.
 *
 * `docs/LINEAGE_GRAPH_SPEC.md` is the contract this file implements. The whole
 * point of the graph is stated there: the passport's lineage is not a list, it
 * is a directed acyclic graph, and every node carries one of four states that
 * must be **derived from the record** rather than decided by a designer.
 *
 *   verified  phosphor  checked against the chain, or recomputed here just now
 *   recorded  dim       present and internally consistent, nothing checked
 *   provider  amber     the provider says so and nothing else does
 *   lost      danger    this link is broken, and the passport says so
 *
 * Nothing in this file renders. That is deliberate: the derivation is where the
 * honesty lives, so it is testable on its own, against real records, without a
 * DOM. `LineageGraph.tsx` draws exactly what this returns and adds no facts of
 * its own.
 *
 * Two decisions worth stating up front, because both look like bugs otherwise:
 *
 * 1. **The task node is always `provider`.** 0G's `progress` field is the
 *    provider reporting on its own work, off chain. `Finished` there does not
 *    mean anyone collected the artifact — that is a separate on-chain fact, read
 *    from `getDeliverables`, and it is what colours the adapter node. A graph
 *    that painted the task node green because a provider said `Finished` would
 *    be laundering an assertion into a verification.
 *
 * 2. **The attestation is `recorded`, never `verified`.** `verifyService()` is
 *    not called anywhere in this codebase, so `tee.attestationVerified` is false
 *    on every real record. Recording a TEE signer is not the same as checking
 *    its quote, and the graph says so.
 *
 * The spec draws eight nodes and labels the first four columns rank 0–3; the
 * chain simply continues past the label, so ranks here run 0–5. Ranks are fixed
 * and computed from the DAG, never from a simulation — a certificate that
 * settles into a different shape on each load looks unstable.
 */

import { addressUrl, blockUrl, storageLookupUrl, storageSubmissionUrl, txUrl } from './chains'
import { formatBytes, formatCount, formatLearningRate, formatOg } from './format'
import { canonicalHash, canonicalize, configHash } from './manifest'
import type { PassportRecord } from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LineageState = 'verified' | 'recorded' | 'provider' | 'lost'

export type LineageNodeId =
  | 'base'
  | 'dataset'
  | 'config'
  | 'task'
  | 'adapter'
  | 'manifest'
  | 'anchor'
  | 'token'

/** The spec's `Kind` column. Drives the node's glyph, never its colour. */
export type LineageKind = 'input' | 'process' | 'artifact' | 'record' | 'anchor' | 'token'

/** The ABI types a passport's fields decode to, matching `TypedRow`. */
export type LineageFieldType = 'bytes32' | 'address' | 'string' | 'uint256' | 'bool'

/** One typed row inside a node's detail panel. */
export interface LineageFact {
  /** The field's dotted name in the manifest, or the concept's name. */
  name: string
  value: string
  type: LineageFieldType
  /** Render through `<Hash>`: full value, copy button, optional proof link. */
  hash?: boolean
  href?: string
  hrefLabel?: string
  /** A real value with no reachable proof — says so rather than linking nowhere. */
  unverifiable?: boolean
  /** Per-fact state, where a single fact is weaker than its node. */
  state?: LineageState
  note?: string
}

/** A real quantity, encoded as node weight. Never invented to fill a bar. */
export interface LineageMagnitude {
  value: number
  label: string
  /** 0–1, log-scaled, so 61 examples and 93 MB can share one visual language. */
  weight: number
}

export interface LineageNode {
  id: LineageNodeId
  rank: number
  kind: LineageKind
  title: string
  /** One short line under the title. */
  subtitle: string
  /** The value the node is really about, small and monospaced on the card. */
  headline: string
  state: LineageState
  /** Why the node has that state, in one sentence. */
  verdict: string
  /** How a stranger checks it themselves — the spec's "Verifiable by" column. */
  checkedBy: string
  facts: LineageFact[]
  magnitude?: LineageMagnitude
}

export interface LineageEdge {
  id: string
  from: LineageNodeId
  to: LineageNodeId
  /** An edge carries a value into a node, so it inherits that node's state. */
  state: LineageState
  /** The link is broken: drawn with a gap, and the trace pulse stops here. */
  severed: boolean
  /** Downstream of a break — drawn dashed, because it carries an admission. */
  afterBreak: boolean
}

export interface Lineage {
  nodes: LineageNode[]
  edges: LineageEdge[]
  /** Number of columns. Fixed, and identical for every record. */
  rankCount: number
  /** True when any node is `lost` — the chain does not complete. */
  broken: boolean
  brokenAt?: LineageNodeId
  /** The in-browser recomputation, which is what makes `verified` mean anything. */
  integrity: 'verified' | 'mismatch' | 'demo'
  /** One line stating what the graph shows. Used as the SVG's accessible name. */
  summary: string
}

// ---------------------------------------------------------------------------
// Guards — no user-controlled value reaches an href unvalidated
// ---------------------------------------------------------------------------

const HEX32 = /^0x[0-9a-fA-F]{64}$/
const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const REPO = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/

export function isHash32(value: string | undefined): value is string {
  return typeof value === 'string' && HEX32.test(value)
}

export function isAddress(value: string | undefined): value is string {
  return typeof value === 'string' && ADDRESS.test(value)
}

/**
 * The only way a URL leaves this module.
 *
 * Every link on a passport is built here from a validated component, but the
 * guard is kept anyway: a record is data, data can be attacker-shaped, and one
 * `javascript:` URL in a certificate would be worth more to an attacker than the
 * rest of this app put together. Anything that is not a plain https URL becomes
 * `undefined`, and the UI renders the value with no link at all.
 */
export function safeUrl(url: string | undefined): string | undefined {
  if (typeof url !== 'string' || !url.startsWith('https://')) return undefined
  if (/[\s"'<>\\]/.test(url)) return undefined
  return url
}

// ---------------------------------------------------------------------------
// Magnitude
// ---------------------------------------------------------------------------

/**
 * A real quantity as a 0–1 weight, log-scaled.
 *
 * The numbers a passport carries span seven orders of magnitude — 61 examples,
 * 584 bytes of manifest, 93,642,469 bytes of adapter — so a linear bar would
 * show one value and flatten the rest. Log10 over a 1e9 ceiling puts all three
 * on one scale and keeps their ordering true.
 */
export function magnitudeWeight(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  const weight = Math.log10(1 + value) / 9
  return Math.min(1, Math.max(0.04, weight))
}

// ---------------------------------------------------------------------------
// The derivation
// ---------------------------------------------------------------------------

const RANKS: Record<LineageNodeId, number> = {
  base: 0,
  dataset: 0,
  config: 0,
  task: 1,
  adapter: 2,
  manifest: 3,
  anchor: 4,
  token: 5,
}

/** DOM order, which is also keyboard order, which is also trace order. */
export const NODE_ORDER: LineageNodeId[] = [
  'base',
  'dataset',
  'config',
  'task',
  'adapter',
  'manifest',
  'anchor',
  'token',
]

const EDGE_PAIRS: Array<[LineageNodeId, LineageNodeId]> = [
  ['base', 'task'],
  ['dataset', 'task'],
  ['config', 'task'],
  ['task', 'adapter'],
  ['adapter', 'manifest'],
  ['manifest', 'anchor'],
  ['anchor', 'token'],
]

export function edgeId(from: LineageNodeId, to: LineageNodeId): string {
  return `${from}-${to}`
}

/**
 * Build the graph for one record.
 *
 * Every state below is a branch on a field of the record. There is no default
 * of `verified` anywhere: a node earns that state by being recomputed here or
 * read off the chain, and absent fields degrade to `recorded` or `lost` rather
 * than being hidden to make the picture tidier.
 */
export function buildLineage(record: PassportRecord): Lineage {
  const { manifest, mint } = record
  const network = manifest.network
  const onChain = record.provenance === 'chain'
  const minted = mint.status === 'minted'

  /** A proof link, but only where following it proves something. */
  const proof = (url: string | undefined): string | undefined =>
    onChain ? safeUrl(url) : undefined

  // ---- the one check performed in this browser -----------------------------
  const hashedDocument = record.anchoredManifest ?? manifest
  const canonical = canonicalize(hashedDocument)
  const recomputed = canonicalHash(hashedDocument)
  const anchored = mint.manifestRootHash
  const matches =
    isHash32(anchored) && recomputed.toLowerCase() === anchored.toLowerCase()

  const integrity: Lineage['integrity'] = !onChain
    ? 'demo'
    : matches
      ? 'verified'
      : 'mismatch'

  const derivedConfigHash = configHash(manifest.training)
  const configAnchored = mint.configHash
  const configMatches =
    isHash32(configAnchored) &&
    configAnchored.toLowerCase() === derivedConfigHash.toLowerCase()

  const adapterOrigin = record.adapterOrigin ?? { kind: 'retrieved' as const }
  const sentinel = adapterOrigin.kind === 'sentinel'
  const acknowledged = record.settlement?.acknowledged
  const storage = record.manifestStorage

  const links = {
    dataset: proof(
      isHash32(manifest.dataset.rootHash)
        ? storageLookupUrl(network, manifest.dataset.rootHash)
        : undefined,
    ),
    adapter:
      sentinel || !isHash32(manifest.adapter.rootHash)
        ? undefined
        : proof(storageLookupUrl(network, manifest.adapter.rootHash)),
    provider: isAddress(manifest.task.provider)
      ? safeUrl(addressUrl(network, manifest.task.provider))
      : undefined,
    teeSigner: isAddress(manifest.tee.signerAddress)
      ? safeUrl(addressUrl(network, manifest.tee.signerAddress))
      : undefined,
    tokenizer: REPO.test(manifest.base.tokenizer)
      ? safeUrl(`https://huggingface.co/${manifest.base.tokenizer}`)
      : undefined,
    manifestDoc: proof(
      isHash32(storage?.rootHash) ? storageLookupUrl(network, storage!.rootHash) : undefined,
    ),
    submission: proof(
      storage?.txSeq !== undefined ? storageSubmissionUrl(network, storage.txSeq) : undefined,
    ),
    contract: isAddress(mint.contractAddress)
      ? proof(addressUrl(network, mint.contractAddress))
      : undefined,
    mintTx: isHash32(mint.txHash) ? proof(txUrl(network, mint.txHash)) : undefined,
    owner: isAddress(mint.owner) ? proof(addressUrl(network, mint.owner)) : undefined,
    block: mint.blockNumber ? proof(blockUrl(network, mint.blockNumber)) : undefined,
  }

  // -------------------------------------------------------------------------
  // rank 0 — the three inputs
  // -------------------------------------------------------------------------

  const base: LineageNode = {
    id: 'base',
    rank: RANKS.base,
    kind: 'input',
    title: 'Base model',
    subtitle: 'the weights trained on top of',
    headline: manifest.base.model,
    // 0G validated this hash against its registered providers when the task was
    // created — on chain, but not by this page, and not now. `recorded` is the
    // honest state for a fact nobody re-checked in front of the reader.
    state: isHash32(manifest.base.modelHash) ? 'recorded' : 'lost',
    verdict: isHash32(manifest.base.modelHash)
      ? '0G validated this hash against its registered providers at task creation. Nothing was re-checked in this browser, so it is recorded, not verified.'
      : 'No base model hash on this record. Without it the origin of the weights is unstated.',
    checkedBy: 'Compare against the model hash 0G publishes for its registered providers.',
    facts: [
      { name: 'base.model', value: manifest.base.model, type: 'string' },
      {
        name: 'base.modelHash',
        value: manifest.base.modelHash,
        type: 'bytes32',
        hash: true,
        note: 'The turbo hash 0G validates a fine-tuning task against at creation.',
      },
      {
        name: 'base.tokenizer',
        value: manifest.base.tokenizer,
        type: 'string',
        href: links.tokenizer,
        hrefLabel: 'huggingface.co',
      },
    ],
  }

  const dataset: LineageNode = {
    id: 'dataset',
    rank: RANKS.dataset,
    kind: 'input',
    title: 'Dataset',
    subtitle: '0G Storage, addressed by Merkle root',
    headline: `${formatCount(manifest.dataset.exampleCount)} examples`,
    state: isHash32(manifest.dataset.rootHash) ? 'recorded' : 'lost',
    verdict: isHash32(manifest.dataset.rootHash)
      ? onChain
        ? 'Retrievable by anyone at this root hash. 0G Storage addresses content by its Merkle root, so a different file would have a different hash — but nothing was fetched here, so this is recorded, not verified.'
        : 'A demo root hash. There is nothing at it to retrieve, and the graph refuses to link a value that would 404.'
      : 'No dataset root hash on this record. The training data is unstated.',
    checkedBy: 'Retrieve it from the 0G Storage indexer at that root hash.',
    facts: [
      {
        name: 'dataset.rootHash',
        value: manifest.dataset.rootHash,
        type: 'bytes32',
        hash: true,
        href: links.dataset,
        hrefLabel: 'storage scan',
        unverifiable: !onChain,
      },
      { name: 'dataset.format', value: manifest.dataset.format, type: 'string' },
      {
        name: 'dataset.exampleCount',
        value: formatCount(manifest.dataset.exampleCount),
        type: 'uint256',
      },
      {
        name: 'dataset.tokenCount',
        value: formatCount(manifest.dataset.tokenCount),
        type: 'uint256',
      },
    ],
    magnitude: {
      value: manifest.dataset.exampleCount,
      label: 'examples',
      weight: magnitudeWeight(manifest.dataset.exampleCount),
    },
  }

  const config: LineageNode = {
    id: 'config',
    rank: RANKS.config,
    kind: 'input',
    title: 'Training config',
    subtitle: 'the five parameters 0G accepts',
    headline: `${manifest.training.num_train_epochs} epochs · ${manifest.training.max_steps} steps`,
    // Recomputed here, from the five parameters, and compared against the value
    // the contract holds. That is a verification the reader watches happen.
    state: configAnchored === undefined ? 'recorded' : configMatches ? 'verified' : 'lost',
    verdict:
      configAnchored === undefined
        ? 'The hash below was recomputed here from the five parameters, but this record carries no anchored configHash to compare it against.'
        : configMatches
          ? 'Recomputed in this browser from the five parameters and it matches PassportData.configHash on chain.'
          : 'Recomputed in this browser and it does not match the configHash anchored on chain. One of the two is wrong.',
    checkedBy: 'Recompute keccak256 over the canonical JSON of the five parameters.',
    facts: [
      {
        name: 'training.configHash',
        value: derivedConfigHash,
        type: 'bytes32',
        hash: true,
        state: configAnchored === undefined ? 'recorded' : configMatches ? 'verified' : 'lost',
        note: 'Derived here from the five accepted keys, not read from the record.',
      },
      ...(configAnchored
        ? [
            {
              name: 'PassportData.configHash',
              value: configAnchored,
              type: 'bytes32' as const,
              hash: true,
              note: 'The value anchored on chain at mint.',
            },
          ]
        : []),
      {
        name: 'num_train_epochs',
        value: String(manifest.training.num_train_epochs),
        type: 'uint256',
      },
      {
        name: 'per_device_train_batch_size',
        value: String(manifest.training.per_device_train_batch_size),
        type: 'uint256',
      },
      {
        name: 'learning_rate',
        value: formatLearningRate(manifest.training.learning_rate),
        type: 'string',
      },
      {
        name: 'neftune_noise_alpha',
        value: String(manifest.training.neftune_noise_alpha),
        type: 'uint256',
      },
      {
        name: 'max_steps',
        value:
          manifest.training.max_steps === -1
            ? '-1 (use epochs)'
            : String(manifest.training.max_steps),
        type: 'uint256',
      },
    ],
  }

  // -------------------------------------------------------------------------
  // rank 1 — the task
  // -------------------------------------------------------------------------

  const task: LineageNode = {
    id: 'task',
    rank: RANKS.task,
    kind: 'process',
    title: '0G compute task',
    subtitle: 'provider hardware, inside an enclave',
    headline: manifest.task.state,
    // Always `provider`, whatever the state says. See the file header.
    state: 'provider',
    verdict:
      'Provider-reported and off chain. 0G’s progress field is the provider describing its own work; it says nothing about whether anyone collected the deliverable. That is a separate on-chain fact, and it is what colours the adapter.',
    checkedBy: 'Read the task from the provider; read the acknowledged TEE signer on chain.',
    facts: [
      { name: 'task.id', value: manifest.task.id, type: 'string' },
      {
        name: 'task.provider',
        value: manifest.task.provider,
        type: 'address',
        hash: true,
        href: links.provider,
        hrefLabel: 'chainscan',
      },
      {
        name: 'task.state',
        value: manifest.task.state,
        type: 'string',
        state: 'provider',
        note: 'Reported by the provider about its own work. Off chain, and advisory.',
      },
      {
        name: 'tee.signerAddress',
        value: manifest.tee.signerAddress,
        type: 'address',
        hash: true,
        href: links.teeSigner,
        hrefLabel: 'chainscan',
      },
      {
        name: 'tee.acknowledged',
        value: manifest.tee.acknowledged ? 'true' : 'false',
        type: 'bool',
        state: manifest.tee.acknowledged ? 'verified' : 'lost',
        note: manifest.tee.acknowledged
          ? 'The provider acknowledged this enclave signer on 0G Chain, which is what makes it checkable with no credentials.'
          : 'The enclave signer is not acknowledged on chain, so nothing ties this run to that key.',
      },
      {
        name: 'tee.attestationVerified',
        value: manifest.tee.attestationVerified ? 'true' : 'false',
        // False on every real record, because verifyService() is never called.
        // Recording a signer is not the same as checking its quote.
        state: manifest.tee.attestationVerified ? 'verified' : 'recorded',
        type: 'bool',
        note: manifest.tee.attestationVerified
          ? 'Intel TDX quote verified for this run.'
          : 'False, and shown as false. verifyService() is not called anywhere in this codebase, and the quote is checked on delivery acknowledgement. Recording a TEE signer is not verifying it.',
      },
      ...(record.hardware
        ? [
            { name: 'hardware.gpu', value: record.hardware.gpu, type: 'string' as const },
            { name: 'hardware.tee', value: record.hardware.tee, type: 'string' as const },
          ]
        : []),
      {
        name: 'fee.totalNeuron',
        value: `${manifest.fee.totalNeuron} (${formatOg(manifest.fee.totalNeuron)} 0G)`,
        type: 'uint256',
      },
    ],
  }

  // -------------------------------------------------------------------------
  // rank 2 — the adapter. The one node that differs between #1 and #2.
  // -------------------------------------------------------------------------

  const adapterState: LineageState = sentinel
    ? 'lost'
    : acknowledged === false
      ? 'lost'
      : acknowledged === true
        ? 'verified'
        : 'recorded'

  const adapterSize = manifest.adapter.sizeBytes

  const adapter: LineageNode = {
    id: 'adapter',
    rank: RANKS.adapter,
    kind: 'artifact',
    title: 'Adapter',
    subtitle: sentinel ? 'sentinel — no artifact exists' : 'LoRA weights, delivered',
    headline: sentinel
      ? 'no artifact'
      : adapterSize
        ? formatBytes(adapterSize)
        : 'delivered',
    state: adapterState,
    verdict: sentinel
      ? 'No adapter was ever retrieved. Passport.sol rejects a zero adapter hash, so the mint anchored keccak256 of a published string instead of a plausible-looking root hash. The preimage is below: hash it yourself and you get the value on chain.'
      : acknowledged === false
        ? 'The deliverable was never acknowledged on chain, so 0G destroyed the artifact and deducted its penalty. The hash points at nothing.'
        : acknowledged === true
          ? 'Acknowledged on chain. getDeliverables().modelRootHash returns this value, and the artifact was downloaded and hash-checked against it.'
          : 'An adapter root hash is recorded, but this record carries no on-chain settlement to check it against.',
    checkedBy: 'Read getDeliverables(provider, taskId).modelRootHash on 0G’s FineTuningServing contract.',
    facts: [
      {
        name: sentinel ? 'adapter.rootHash — SENTINEL' : 'adapter.rootHash',
        value: manifest.adapter.rootHash,
        type: 'bytes32',
        hash: true,
        href: links.adapter,
        hrefLabel: 'storage scan',
        unverifiable: !sentinel && !onChain,
        state: adapterState,
        note: sentinel
          ? 'keccak256 of a published string, not the Merkle root of a file. There is no artifact behind this value.'
          : undefined,
      },
      ...(sentinel && adapterOrigin.sentinelPreimage
        ? [
            {
              name: 'sentinel preimage',
              value: adapterOrigin.sentinelPreimage,
              type: 'string' as const,
              state: 'lost' as const,
              note: 'Hash this string and you reproduce the value anchored on chain — which is how you know no adapter exists, rather than taking our word for it.',
            },
          ]
        : []),
      ...(adapterSize
        ? [
            {
              name: 'adapter.sizeBytes',
              value: `${formatCount(adapterSize)} bytes (${formatBytes(adapterSize)})`,
              type: 'uint256' as const,
            },
          ]
        : []),
      ...(acknowledged !== undefined
        ? [
            {
              name: 'getDeliverables.acknowledged',
              value: acknowledged ? 'true' : 'false',
              type: 'bool' as const,
              state: acknowledged ? ('verified' as const) : ('lost' as const),
              note: 'Read from 0G’s FineTuningServing contract, not from the provider. On chain, and authoritative.',
            },
          ]
        : []),
      ...(record.settlement?.penaltyNeuron
        ? [
            {
              name: 'penalty deducted',
              value: `${record.settlement.penaltyNeuron} (${formatOg(
                record.settlement.penaltyNeuron,
              )} 0G)`,
              type: 'uint256' as const,
              state: 'lost' as const,
              note: `${penaltyPercent(
                record.settlement.penaltyNeuron,
                manifest.fee.totalNeuron,
              )} of the fee — 0G’s missed-acknowledgement deduction, computed from the two amounts rather than restated as a constant.`,
            },
          ]
        : []),
      ...(sentinel && adapterOrigin.reason
        ? [
            {
              name: 'why',
              value: adapterOrigin.reason,
              type: 'string' as const,
              state: 'lost' as const,
            },
          ]
        : []),
    ],
    magnitude: adapterSize
      ? { value: adapterSize, label: 'bytes', weight: magnitudeWeight(adapterSize) }
      : undefined,
  }

  // -------------------------------------------------------------------------
  // rank 3–5 — the record, its anchor, and the token
  // -------------------------------------------------------------------------

  const manifestState: LineageState = !onChain ? 'recorded' : matches ? 'verified' : 'lost'

  const manifestNode: LineageNode = {
    id: 'manifest',
    rank: RANKS.manifest,
    kind: 'record',
    title: 'Manifest',
    subtitle: 'canonical JSON, keys sorted, no whitespace',
    headline: `${canonical.length} bytes`,
    state: manifestState,
    verdict: !onChain
      ? 'Recomputed here from the document on this page, but this is a demo record: there is no anchored value to compare it against.'
      : matches
        ? 'keccak256 over the canonical document, computed in this browser just now, reproduces the hash anchored on chain byte for byte.'
        : 'The document on this page does not hash to the anchored value. Either it was altered after minting, or the anchor belongs to a different document.',
    checkedBy: 'Download it from 0G Storage, canonicalise it, and recompute its keccak256.',
    facts: [
      {
        name: 'keccak256(canonicalize(doc))',
        value: recomputed,
        type: 'bytes32',
        hash: true,
        state: manifestState,
        note: 'Computed client-side, from the exact document this token committed to.',
      },
      {
        name: 'canonical size',
        value: `${canonical.length} bytes`,
        type: 'uint256',
        note:
          record.anchoredManifest === undefined
            ? 'The v1 manifest, canonicalised.'
            : 'The smaller record this token was minted against, carried verbatim. Hashing anything else would not reproduce the anchored value.',
      },
      ...(storage?.rootHash
        ? [
            {
              name: 'manifestStorage.rootHash',
              value: storage.rootHash,
              type: 'bytes32' as const,
              hash: true,
              href: links.manifestDoc,
              hrefLabel: 'storage scan',
              unverifiable: !onChain,
              note: 'Where the document itself lives on 0G Storage. This is what closes the loop: fetch it, hash it, compare.',
            },
          ]
        : []),
      ...(storage?.txSeq !== undefined
        ? [
            {
              name: 'manifestStorage.txSeq',
              value: `#${storage.txSeq}`,
              type: 'uint256' as const,
              href: links.submission,
              hrefLabel: 'storage scan',
            },
          ]
        : []),
      ...(storage?.sizeBytes
        ? [
            {
              name: 'manifestStorage.sizeBytes',
              value: `${formatCount(storage.sizeBytes)} bytes`,
              type: 'uint256' as const,
            },
          ]
        : []),
    ],
    magnitude: storage?.sizeBytes
      ? { value: storage.sizeBytes, label: 'bytes', weight: magnitudeWeight(storage.sizeBytes) }
      : { value: canonical.length, label: 'bytes', weight: magnitudeWeight(canonical.length) },
  }

  const anchorState: LineageState = !onChain || !minted ? 'recorded' : matches ? 'verified' : 'lost'

  const anchor: LineageNode = {
    id: 'anchor',
    rank: RANKS.anchor,
    kind: 'anchor',
    title: 'On-chain anchor',
    subtitle: 'Passport.sol · manifestRootHash',
    headline: mint.blockNumber ? `block ${formatCount(mint.blockNumber)}` : mint.status,
    state: anchorState,
    verdict: !onChain
      ? 'Demo record. Nothing was anchored, so there is nothing on a chain to disagree with.'
      : !minted
        ? 'The manifest is written but the mint has not landed. Until it does, the lineage is readable but not tamper-evident.'
        : matches
          ? 'The hash anchored here equals the one recomputed in this browser, so verifyManifest returns true for it and false for every other value.'
          : 'The anchored hash and the recomputed hash disagree. Do not trust this passport.',
    checkedBy: 'Call verifyManifest(tokenId, hash) on Passport.sol — it returns a bool.',
    facts: [
      {
        name: 'manifestRootHash (anchored)',
        value: anchored,
        type: 'bytes32',
        hash: true,
        note: 'Public, and checkable without decrypting anything.',
      },
      {
        name: 'manifestRootHash (recomputed here)',
        value: recomputed,
        type: 'bytes32',
        hash: true,
        state: anchorState,
      },
      ...(mint.contractAddress
        ? [
            {
              name: 'passportContract',
              value: mint.contractAddress,
              type: 'address' as const,
              hash: true,
              href: links.contract,
              hrefLabel: 'chainscan',
              unverifiable: !onChain,
            },
          ]
        : []),
      ...(mint.blockNumber
        ? [
            {
              name: 'blockNumber',
              value: formatCount(mint.blockNumber),
              type: 'uint256' as const,
              href: links.block,
              hrefLabel: 'chainscan',
            },
          ]
        : []),
      {
        name: 'verifyManifest',
        value: `verifyManifest(${mint.tokenId ?? '<tokenId>'}, ${recomputed}) → ${
          anchorState === 'verified' ? 'true' : anchorState === 'lost' ? 'false' : 'not deployed'
        }`,
        type: 'bool',
        state: anchorState,
      },
    ],
  }

  const tokenState: LineageState = onChain && minted ? 'verified' : 'recorded'

  const token: LineageNode = {
    id: 'token',
    rank: RANKS.token,
    kind: 'token',
    title: 'Agentic ID',
    subtitle: 'ERC-7857-style, one token per run',
    headline: mint.tokenId ? `#${mint.tokenId}` : 'not minted',
    state: tokenState,
    verdict:
      onChain && minted
        ? 'Minted, and its owner is readable on chain with ownerOf(tokenId). The transaction and block below both resolve on the explorer.'
        : minted
          ? 'A demo token id. Nothing was minted, so no explorer link is drawn — a link that 404s teaches the reader that the links are decorative.'
          : 'No token yet. The lineage above exists; nothing has claimed it on chain.',
    checkedBy: 'Call ownerOf(tokenId) on the Passport contract.',
    facts: [
      { name: 'tokenId', value: mint.tokenId ?? '—', type: 'uint256' },
      {
        name: 'mint.status',
        value: mint.status,
        type: 'string',
        state: tokenState,
      },
      ...(mint.owner
        ? [
            {
              name: 'owner',
              value: mint.owner,
              type: 'address' as const,
              hash: true,
              href: links.owner,
              hrefLabel: 'chainscan',
              unverifiable: !onChain,
            },
          ]
        : []),
      ...(mint.txHash
        ? [
            {
              name: 'mintTransaction',
              value: mint.txHash,
              type: 'bytes32' as const,
              hash: true,
              href: links.mintTx,
              hrefLabel: 'chainscan',
              unverifiable: !onChain,
            },
          ]
        : []),
    ],
  }

  const nodes: LineageNode[] = [base, dataset, config, task, adapter, manifestNode, anchor, token]
  const byId = new Map(nodes.map((n) => [n.id, n]))

  const brokenIndex = nodes.findIndex((n) => n.state === 'lost')
  const brokenAt = brokenIndex >= 0 ? nodes[brokenIndex]!.id : undefined

  const edges: LineageEdge[] = EDGE_PAIRS.map(([from, to]) => {
    const target = byId.get(to)!
    const fromIndex = NODE_ORDER.indexOf(from)
    return {
      id: edgeId(from, to),
      from,
      to,
      // An edge carries a value into a node, so it is exactly as trustworthy as
      // what arrives. A green edge into a dead node would be a lie.
      state: target.state,
      severed: target.state === 'lost',
      afterBreak: brokenIndex >= 0 && fromIndex >= brokenIndex,
    }
  })

  return {
    nodes,
    edges,
    rankCount: 6,
    broken: brokenIndex >= 0,
    brokenAt,
    integrity,
    summary: summarise(nodes, brokenAt, integrity),
  }
}

function summarise(
  nodes: LineageNode[],
  brokenAt: LineageNodeId | undefined,
  integrity: Lineage['integrity'],
): string {
  const verified = nodes.filter((n) => n.state === 'verified').length
  const head = `Lineage graph: ${nodes.length} nodes, ${verified} verified in this browser or on chain`
  if (brokenAt) {
    const node = nodes.find((n) => n.id === brokenAt)!
    return `${head}. The chain breaks at ${node.title.toLowerCase()} — ${node.headline}.`
  }
  if (integrity === 'demo') return `${head}. Demo record: nothing is anchored on chain.`
  return `${head}. The chain completes: every link from the base weights to the token.`
}

/**
 * The penalty as a percentage of the fee, computed from the two neuron amounts
 * rather than restating "30%" as a constant. If the numbers ever stop agreeing
 * with 0G's documented deduction, the graph says so instead of the doc winning.
 */
export function penaltyPercent(penaltyNeuron: string, totalNeuron: string): string {
  try {
    const penalty = BigInt(penaltyNeuron)
    const total = BigInt(totalNeuron)
    if (total === 0n) return '—'
    const basis = (penalty * 1_000_000n) / total
    const whole = basis / 10_000n
    const fraction = (basis % 10_000n).toString().padStart(4, '0')
    return `${whole}.${fraction}%`
  } catch {
    return '—'
  }
}

// ---------------------------------------------------------------------------
// The trace — a pulse travelling the chain
// ---------------------------------------------------------------------------

export interface TraceStep {
  kind: 'node' | 'edge'
  /** Node ids or edge ids lit by this step. The three inputs converge together. */
  ids: string[]
  ms: number
  /**
   * The pulse dies here. Set on the edge into a `lost` node: the comet stops
   * partway, the edge renders severed, and the chain visibly does not complete.
   */
  halt?: boolean
}

/**
 * The schedule the "trace this provenance" control plays.
 *
 * Roughly 3.4s end to end on a chain that completes, and about 1.8s on one that
 * breaks — because it stops when it breaks. That truncation is the point: the
 * reader does not have to be told the run failed, they watch it fail.
 *
 * Pure, so the timing is testable without a clock.
 */
export function traceSchedule(lineage: Lineage): TraceStep[] {
  const steps: TraceStep[] = []
  const edgeBy = new Map(lineage.edges.map((e) => [e.id, e]))

  steps.push({ kind: 'node', ids: ['base'], ms: 120 })
  steps.push({ kind: 'node', ids: ['dataset'], ms: 120 })
  steps.push({ kind: 'node', ids: ['config'], ms: 120 })
  // The three inputs converge on the task at once — that is what the fan-in in
  // the spec's diagram means, and staggering it would misdescribe the DAG.
  steps.push({
    kind: 'edge',
    ids: [edgeId('base', 'task'), edgeId('dataset', 'task'), edgeId('config', 'task')],
    ms: 420,
  })
  steps.push({ kind: 'node', ids: ['task'], ms: 420 })

  const chain: Array<[LineageNodeId, LineageNodeId, number, number]> = [
    ['task', 'adapter', 380, 300],
    ['adapter', 'manifest', 260, 240],
    ['manifest', 'anchor', 260, 260],
    ['anchor', 'token', 260, 340],
  ]

  for (const [from, to, edgeMs, nodeMs] of chain) {
    const edge = edgeBy.get(edgeId(from, to))
    const halt = edge?.severed === true
    steps.push({ kind: 'edge', ids: [edgeId(from, to)], ms: edgeMs, halt })
    steps.push({ kind: 'node', ids: [to], ms: nodeMs })
    // The chain stopped here. Nothing downstream of a break gets to animate as
    // though a value arrived, because none did.
    if (halt) break
  }

  return steps
}

export function traceDuration(steps: TraceStep[]): number {
  return steps.reduce((total, step) => total + step.ms, 0)
}

// ---------------------------------------------------------------------------
// Layout — fixed ranks, no simulation
// ---------------------------------------------------------------------------

export type Orientation = 'horizontal' | 'vertical'

export interface LayoutNode {
  id: LineageNodeId
  x: number
  y: number
  w: number
  h: number
}

export interface LayoutEdge {
  id: string
  /** SVG path data. Drawn with pathLength=100, so dash maths is in percent. */
  d: string
  /** Point at which a severed edge stops, as a fraction of the path. */
  breakAt: number
}

export interface LineageLayout {
  width: number
  height: number
  nodes: Record<string, LayoutNode>
  edges: Record<string, LayoutEdge>
  orientation: Orientation
}

const H = { w: 152, h: 92, colGap: 34, rowGap: 22, pad: 10 }
const V = { w: 300, h: 84, rowGap: 44, pad: 10 }

/**
 * Where every node sits. Deterministic, and identical on every load.
 *
 * The spec forbids a force-directed layout for a reason a designer would call
 * aesthetic and an auditor would call structural: a certificate that settles
 * into a different shape each time it is opened does not look like a record, it
 * looks like a toy.
 */
export function layoutLineage(lineage: Lineage, orientation: Orientation): LineageLayout {
  return orientation === 'vertical'
    ? verticalLayout(lineage)
    : horizontalLayout(lineage)
}

function horizontalLayout(lineage: Lineage): LineageLayout {
  const rank0 = lineage.nodes.filter((n) => n.rank === 0)
  const columnHeight = rank0.length * H.h + (rank0.length - 1) * H.rowGap
  const height = columnHeight + H.pad * 2
  const width = H.pad * 2 + (lineage.rankCount - 1) * (H.w + H.colGap) + H.w

  const nodes: Record<string, LayoutNode> = {}
  let stacked = 0

  for (const node of lineage.nodes) {
    const x = H.pad + node.rank * (H.w + H.colGap)
    const y =
      node.rank === 0
        ? H.pad + stacked++ * (H.h + H.rowGap)
        : H.pad + (columnHeight - H.h) / 2
    nodes[node.id] = { id: node.id, x, y, w: H.w, h: H.h }
  }

  const edges: Record<string, LayoutEdge> = {}
  for (const edge of lineage.edges) {
    const a = nodes[edge.from]!
    const b = nodes[edge.to]!
    const x1 = a.x + a.w
    const y1 = a.y + a.h / 2
    const x2 = b.x
    const y2 = b.y + b.h / 2
    const dx = Math.max(18, (x2 - x1) * 0.55)
    edges[edge.id] = {
      id: edge.id,
      d: `M ${r(x1)} ${r(y1)} C ${r(x1 + dx)} ${r(y1)}, ${r(x2 - dx)} ${r(y2)}, ${r(x2)} ${r(y2)}`,
      breakAt: 0.55,
    }
  }

  return { width, height, nodes, edges, orientation: 'horizontal' }
}

function verticalLayout(lineage: Lineage): LineageLayout {
  const width = V.w + V.pad * 2
  const height = lineage.nodes.length * V.h + (lineage.nodes.length - 1) * V.rowGap + V.pad * 2

  const nodes: Record<string, LayoutNode> = {}
  lineage.nodes.forEach((node, index) => {
    nodes[node.id] = {
      id: node.id,
      x: V.pad,
      y: V.pad + index * (V.h + V.rowGap),
      w: V.w,
      h: V.h,
    }
  })

  const edges: Record<string, LayoutEdge> = {}
  for (const edge of lineage.edges) {
    const a = nodes[edge.from]!
    const b = nodes[edge.to]!
    // The three inputs stack, so their edges into the task leave from the side
    // and curve down rather than overlapping each other on one vertical line.
    const sameColumn = a.y + a.h < b.y
    const x1 = a.x + a.w / 2
    const y1 = a.y + a.h
    const x2 = b.x + b.w / 2
    const y2 = b.y
    const dy = Math.max(14, (y2 - y1) * 0.5)
    edges[edge.id] = {
      id: edge.id,
      d: sameColumn
        ? `M ${r(x1)} ${r(y1)} C ${r(x1)} ${r(y1 + dy)}, ${r(x2)} ${r(y2 - dy)}, ${r(x2)} ${r(y2)}`
        : `M ${r(x1)} ${r(y1)} L ${r(x2)} ${r(y2)}`,
      breakAt: 0.55,
    }
  }

  return { width, height, nodes, edges, orientation: 'vertical' }
}

function r(value: number): number {
  return Math.round(value * 100) / 100
}
