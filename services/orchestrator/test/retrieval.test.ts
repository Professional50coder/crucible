import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HttpModelRetriever, preferHttpRetrieval, type FetchLike } from '../src/retrieval.js'
import { zgStorageRoot } from '../src/storage-hash.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crucible-retrieval-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** A fetch that always returns the given bytes with HTTP 200. */
function fetchReturning(bytes: Uint8Array, capturedUrls?: string[]): FetchLike {
  return async (url: string) => {
    capturedUrls?.push(url)
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    }
  }
}

describe('preferHttpRetrieval — win32 selects the HTTP path', () => {
  it('prefers HTTP on win32 for auto/0g-storage/undefined', () => {
    expect(preferHttpRetrieval('win32', 'auto')).toBe(true)
    expect(preferHttpRetrieval('win32', '0g-storage')).toBe(true)
    expect(preferHttpRetrieval('win32', undefined)).toBe(true)
  })

  it('honours an explicit tee request even on win32', () => {
    expect(preferHttpRetrieval('win32', 'tee')).toBe(false)
  })

  it('leaves the SDK path in place on other platforms', () => {
    expect(preferHttpRetrieval('linux', 'auto')).toBe(false)
    expect(preferHttpRetrieval('darwin', 'auto')).toBe(false)
  })
})

describe('HttpModelRetriever — download and validate against the on-chain root', () => {
  const bytes = new Uint8Array(Array.from({ length: 5000 }, (_, i) => (i * 31 + 7) & 0xff))
  const realRoot = zgStorageRoot(bytes)

  it('downloads from the indexer file gateway keyed by root hash', async () => {
    const urls: string[] = []
    const retriever = new HttpModelRetriever({ fetchImpl: fetchReturning(bytes, urls) })
    const destPath = join(dir, 'model.bin')

    const result = await retriever.retrieve({ network: 'testnet', rootHash: realRoot, destPath })

    expect(urls).toHaveLength(1)
    expect(urls[0]).toBe(`https://indexer-storage-testnet-turbo.0g.ai/file?root=${realRoot}`)
    expect(result.sizeBytes).toBe(bytes.length)
    expect(result.rootHash).toBe(realRoot)
    expect(existsSync(destPath)).toBe(true)
    expect(new Uint8Array(readFileSync(destPath))).toEqual(bytes)
  })

  it('validates the downloaded bytes against the on-chain root before writing', async () => {
    // The chain says one root; the indexer hands back different bytes.
    const wrongRoot = zgStorageRoot(new Uint8Array([1, 2, 3, 4]))
    const retriever = new HttpModelRetriever({ fetchImpl: fetchReturning(bytes) })
    const destPath = join(dir, 'model.bin')

    await expect(
      retriever.retrieve({ network: 'testnet', rootHash: wrongRoot, destPath }),
    ).rejects.toThrow(/FAILED validation|does not match/i)
    // Nothing unvalidated is ever written to disk.
    expect(existsSync(destPath)).toBe(false)
  })

  it('uses the mainnet indexer for a mainnet job', async () => {
    const urls: string[] = []
    const retriever = new HttpModelRetriever({ fetchImpl: fetchReturning(bytes, urls) })
    await retriever.retrieve({ network: 'mainnet', rootHash: realRoot, destPath: join(dir, 'm.bin') })
    expect(urls[0]).toContain('https://indexer-storage-turbo.0g.ai/file?root=')
  })

  it('rejects a non-hex root rather than fetching', async () => {
    let fetched = false
    const retriever = new HttpModelRetriever({
      fetchImpl: async () => {
        fetched = true
        return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) }
      },
    })
    await expect(
      retriever.retrieve({ network: 'testnet', rootHash: 'sentinel', destPath: join(dir, 'x.bin') }),
    ).rejects.toThrow(/not a 0x-prefixed root hash/i)
    expect(fetched).toBe(false)
  })

  it('surfaces an HTTP error from the indexer', async () => {
    const retriever = new HttpModelRetriever({
      fetchImpl: async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }),
    })
    await expect(
      retriever.retrieve({ network: 'testnet', rootHash: realRoot, destPath: join(dir, 'x.bin') }),
    ).rejects.toThrow(/HTTP 404/)
  })

  it('rejects an empty body', async () => {
    const retriever = new HttpModelRetriever({ fetchImpl: fetchReturning(new Uint8Array(0)) })
    await expect(
      retriever.retrieve({ network: 'testnet', rootHash: realRoot, destPath: join(dir, 'x.bin') }),
    ).rejects.toThrow(/empty body/i)
  })

  it('accepts a case-mismatched but equal root hash', async () => {
    const retriever = new HttpModelRetriever({ fetchImpl: fetchReturning(bytes) })
    const result = await retriever.retrieve({
      network: 'testnet',
      rootHash: realRoot.toUpperCase().replace('0X', '0x'),
      destPath: join(dir, 'model.bin'),
    })
    expect(result.rootHash.toLowerCase()).toBe(realRoot.toLowerCase())
  })
})
