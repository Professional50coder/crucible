import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { NETWORKS } from './networks.js'
import { zgStorageRoot } from './storage-hash.js'
import type { NetworkName } from './types.js'

/**
 * ## The Windows-safe model-retrieval path (DEFECT-01)
 *
 * The SDK's `acknowledgeModel` cannot retrieve a delivered model on Windows on
 * either of its paths: the TEE download throws `stream.on is not a function` on
 * every platform, and the 0G Storage path spawns a bundled `0g-storage-client`
 * that is a Linux ELF binary and `ENOENT`s on win32. With `downloadMethod:'auto'`
 * a Windows user hits both and loses the model.
 *
 * The 0G Storage indexer exposes a plain HTTP gateway that is content-addressed
 * by root hash — `GET {indexer}/file?root=<rootHash>` returns the file bytes.
 * That needs no bundled binary and works everywhere. This module downloads over
 * that gateway and then RE-DERIVES the 0G Storage Merkle root of the bytes it
 * got and checks it against the root the provider committed on-chain. The gateway
 * is convenient but not trusted; the chain is authoritative, so nothing is
 * acknowledged until the bytes prove they are the committed artifact.
 */

/** A request to retrieve one artifact by its on-chain root hash. */
export interface RetrieveRequest {
  network: NetworkName
  /** The provider's on-chain model root hash — the authority we validate against. */
  rootHash: string
  /** Absolute path to write the validated artifact to. */
  destPath: string
}

export interface RetrieveResult {
  path: string
  sizeBytes: number
  /** The recomputed root — equal to the requested `rootHash` once validated. */
  rootHash: string
}

/**
 * Retrieves a delivered artifact and guarantees it matches an on-chain root.
 * Implementations MUST throw rather than return unvalidated bytes.
 */
export interface ModelRetriever {
  retrieve(request: RetrieveRequest): Promise<RetrieveResult>
}

/** Minimal `fetch` shape, so tests can inject one without a real network. */
export type FetchLike = (
  url: string,
) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>

export interface HttpModelRetrieverOptions {
  /** Defaults to the global `fetch`. */
  fetchImpl?: FetchLike
  /** Indexer base URL per network. Defaults to `NETWORKS[*].indexerUrl`. */
  indexerUrls?: Partial<Record<NetworkName, string>>
  /** Root-hash function. Defaults to the real 0G Storage Merkle root. */
  rootHasher?: (bytes: Uint8Array) => string
}

/**
 * Decide whether to prefer the HTTP retrieval path over the SDK's own download.
 *
 * On win32 the SDK path is broken both ways (DEFECT-01), so HTTP is selected for
 * every method except an explicit `tee` — a caller asking for the TEE path by
 * name is opting out of storage retrieval, and we honour that rather than
 * silently overriding it. On other platforms the SDK path is left in place and
 * HTTP remains available as a deliberate fallback (used by the recovery flow).
 */
export function preferHttpRetrieval(
  platform: NodeJS.Platform,
  downloadMethod?: 'tee' | '0g-storage' | 'auto',
): boolean {
  if (downloadMethod === 'tee') return false
  return platform === 'win32'
}

/** The HTTP indexer implementation of {@link ModelRetriever}. */
export class HttpModelRetriever implements ModelRetriever {
  readonly #fetch: FetchLike
  readonly #indexerUrls: Partial<Record<NetworkName, string>>
  readonly #rootHasher: (bytes: Uint8Array) => string

  constructor(options: HttpModelRetrieverOptions = {}) {
    const globalFetch = (globalThis as { fetch?: FetchLike }).fetch
    const fetchImpl = options.fetchImpl ?? globalFetch
    if (!fetchImpl) {
      throw new Error('No fetch implementation available; pass options.fetchImpl.')
    }
    this.#fetch = fetchImpl
    this.#indexerUrls = options.indexerUrls ?? {}
    this.#rootHasher = options.rootHasher ?? zgStorageRoot
  }

  #indexerFor(network: NetworkName): string {
    return this.#indexerUrls[network] ?? NETWORKS[network].indexerUrl
  }

  async retrieve(request: RetrieveRequest): Promise<RetrieveResult> {
    const { network, rootHash, destPath } = request
    if (!/^0x[0-9a-fA-F]+$/.test(rootHash)) {
      throw new Error(`Refusing to retrieve: "${rootHash}" is not a 0x-prefixed root hash.`)
    }

    const url = `${this.#indexerFor(network)}/file?root=${rootHash}`
    const response = await this.#fetch(url)
    if (!response.ok) {
      throw new Error(`Indexer returned HTTP ${response.status} for ${url}`)
    }

    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length === 0) {
      throw new Error(`Indexer returned an empty body for root ${rootHash}`)
    }

    // The one check the whole path exists for: bytes must reproduce the on-chain
    // root before anything downstream may treat them as the delivered model.
    const computed = this.#rootHasher(bytes)
    if (computed.toLowerCase() !== rootHash.toLowerCase()) {
      throw new Error(
        `Downloaded artifact FAILED validation: its 0G Storage root ${computed} does not match ` +
          `the on-chain model root ${rootHash}. The bytes at the indexer are not the committed ` +
          `artifact — refusing to acknowledge.`,
      )
    }

    mkdirSync(dirname(destPath), { recursive: true })
    writeFileSync(destPath, bytes)

    return { path: destPath, sizeBytes: bytes.length, rootHash: computed }
  }
}
