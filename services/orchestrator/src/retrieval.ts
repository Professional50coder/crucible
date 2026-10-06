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
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean
  status: number
  /** When present the body is consumed as a stream, so a dropped connection keeps its progress. */
  body?: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> } } | null
  arrayBuffer(): Promise<ArrayBuffer>
}>

export interface HttpModelRetrieverOptions {
  /** Defaults to the global `fetch`. */
  fetchImpl?: FetchLike
  /** Indexer base URL per network. Defaults to `NETWORKS[*].indexerUrl`. */
  indexerUrls?: Partial<Record<NetworkName, string>>
  /** Root-hash function. Defaults to the real 0G Storage Merkle root. */
  rootHasher?: (bytes: Uint8Array) => string
  /** Attempts per download before giving up. Defaults to 8. */
  maxAttempts?: number
  /** Delay before retry `n` (1-based), in ms. Defaults to a capped exponential backoff. */
  backoffMs?: (attempt: number) => number
  /** Sleep implementation, injectable so tests need not wait. */
  sleep?: (ms: number) => Promise<void>
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
  readonly #maxAttempts: number
  readonly #backoffMs: (attempt: number) => number
  readonly #sleep: (ms: number) => Promise<void>

  constructor(options: HttpModelRetrieverOptions = {}) {
    const globalFetch = (globalThis as { fetch?: FetchLike }).fetch
    const fetchImpl = options.fetchImpl ?? globalFetch
    if (!fetchImpl) {
      throw new Error('No fetch implementation available; pass options.fetchImpl.')
    }
    this.#fetch = fetchImpl
    this.#indexerUrls = options.indexerUrls ?? {}
    this.#rootHasher = options.rootHasher ?? zgStorageRoot
    this.#maxAttempts = Math.max(1, options.maxAttempts ?? 8)
    this.#backoffMs = options.backoffMs ?? ((n) => Math.min(500 * 2 ** (n - 1), 8000))
    this.#sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  }

  /**
   * Download `url` fully, resuming after a dropped connection.
   *
   * Windows' schannel stack drops large single-shot downloads partway (run 4 lost
   * a 93 MB body at ~61 MB). Chunks are kept as they arrive; on failure the next
   * attempt asks for `Range: bytes=<received>-`. A 206 continues, a 200 means the
   * server ignored the range so we restart from zero rather than splice wrongly.
   * HTTP errors are not retried except 5xx/429. The result is NOT trusted — the
   * caller still validates it against the on-chain root.
   */
  async #download(url: string): Promise<Uint8Array> {
    const chunks: Uint8Array[] = []
    let received = 0
    let lastError: unknown

    for (let attempt = 1; attempt <= this.#maxAttempts; attempt++) {
      try {
        const init = received > 0 ? { headers: { Range: `bytes=${received}-` } } : undefined
        const response = await this.#fetch(url, init)

        if (response.status === 416 && received > 0) {
          lastError = undefined
          break // already have everything
        }
        if (!response.ok) {
          const err = new Error(`Indexer returned HTTP ${response.status} for ${url}`)
          if (response.status >= 500 || response.status === 429) throw err
          throw Object.assign(err, { fatal: true })
        }
        if (received > 0 && response.status !== 206) {
          chunks.length = 0
          received = 0
        }

        if (response.body) {
          const reader = response.body.getReader()
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            if (value && value.length > 0) {
              chunks.push(value)
              received += value.length
            }
          }
        } else {
          const whole = new Uint8Array(await response.arrayBuffer())
          chunks.push(whole)
          received += whole.length
        }
        lastError = undefined
        break
      } catch (error) {
        if ((error as { fatal?: boolean }).fatal) throw error
        lastError = error
        if (attempt < this.#maxAttempts) await this.#sleep(this.#backoffMs(attempt))
      }
    }

    if (lastError !== undefined) {
      const reason = lastError instanceof Error ? lastError.message : String(lastError)
      throw new Error(
        `Download of ${url} failed after ${this.#maxAttempts} attempts at ${received} bytes: ${reason}`,
      )
    }

    const out = new Uint8Array(received)
    let offset = 0
    for (const chunk of chunks) {
      out.set(chunk, offset)
      offset += chunk.length
    }
    return out
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
    const bytes = await this.#download(url)
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
