import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HttpModelRetriever, type FetchLike } from '../src/retrieval.js'
import { zgStorageRoot } from '../src/storage-hash.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crucible-resume-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const bytes = new Uint8Array(Array.from({ length: 9000 }, (_, i) => (i * 13 + 5) & 0xff))
const realRoot = zgStorageRoot(bytes)
const noWait = { sleep: async () => {}, backoffMs: () => 0 }
const empty = async () => new ArrayBuffer(0)

/** A body yielding `data` in 1000-byte chunks, throwing after `failAfter` bytes if set. */
function streamOf(data: Uint8Array, failAfter?: number) {
  let pos = 0
  return {
    getReader: () => ({
      async read() {
        if (failAfter !== undefined && pos >= failAfter) throw new Error('connection reset')
        if (pos >= data.length) return { done: true as const }
        const value = data.slice(pos, pos + 1000)
        pos += value.length
        return { done: false as const, value }
      },
    }),
  }
}

const rangeStart = (range?: string) => Number(/bytes=(\d+)-/.exec(range ?? '')?.[1] ?? 0)

describe('HttpModelRetriever — streaming and resume', () => {
  it('resumes from the received offset with a Range request after a mid-stream drop', async () => {
    const ranges: (string | undefined)[] = []
    let call = 0
    const fetchImpl: FetchLike = async (_url, init) => {
      ranges.push(init?.headers?.Range)
      call++
      if (call === 1) return { ok: true, status: 200, body: streamOf(bytes, 4000), arrayBuffer: empty }
      return {
        ok: true,
        status: 206,
        body: streamOf(bytes.slice(rangeStart(init?.headers?.Range))),
        arrayBuffer: empty,
      }
    }
    const retriever = new HttpModelRetriever({ fetchImpl, ...noWait })
    const destPath = join(dir, 'resumed.bin')
    const result = await retriever.retrieve({ network: 'testnet', rootHash: realRoot, destPath })

    expect(ranges).toEqual([undefined, 'bytes=4000-'])
    expect(result.sizeBytes).toBe(bytes.length)
    expect(new Uint8Array(readFileSync(destPath))).toEqual(bytes)
  })

  it('restarts from zero when the server ignores Range and answers 200', async () => {
    let call = 0
    const fetchImpl: FetchLike = async () => {
      call++
      const body = call === 1 ? streamOf(bytes, 3000) : streamOf(bytes)
      return { ok: true, status: 200, body, arrayBuffer: empty }
    }
    const retriever = new HttpModelRetriever({ fetchImpl, ...noWait })
    const result = await retriever.retrieve({
      network: 'testnet',
      rootHash: realRoot,
      destPath: join(dir, 'r.bin'),
    })
    expect(result.sizeBytes).toBe(bytes.length)
  })

  it('still refuses a resumed download whose bytes miss the on-chain root', async () => {
    const corrupt = bytes.slice()
    corrupt[5000] ^= 0xff
    let call = 0
    const fetchImpl: FetchLike = async (_url, init) => {
      call++
      if (call === 1) return { ok: true, status: 200, body: streamOf(corrupt, 2000), arrayBuffer: empty }
      return {
        ok: true,
        status: 206,
        body: streamOf(corrupt.slice(rangeStart(init?.headers?.Range))),
        arrayBuffer: empty,
      }
    }
    const retriever = new HttpModelRetriever({ fetchImpl, ...noWait })
    const destPath = join(dir, 'bad.bin')
    await expect(
      retriever.retrieve({ network: 'testnet', rootHash: realRoot, destPath }),
    ).rejects.toThrow(/FAILED validation/)
    expect(existsSync(destPath)).toBe(false)
  })

  it('gives up after maxAttempts and reports progress', async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      status: 200,
      body: streamOf(bytes, 1000),
      arrayBuffer: empty,
    })
    const retriever = new HttpModelRetriever({ fetchImpl, maxAttempts: 3, ...noWait })
    await expect(
      retriever.retrieve({ network: 'testnet', rootHash: realRoot, destPath: join(dir, 'g.bin') }),
    ).rejects.toThrow(/failed after 3 attempts/)
  })

  it('does not retry a 404', async () => {
    let calls = 0
    const fetchImpl: FetchLike = async () => {
      calls++
      return { ok: false, status: 404, arrayBuffer: empty }
    }
    const retriever = new HttpModelRetriever({ fetchImpl, ...noWait })
    await expect(
      retriever.retrieve({ network: 'testnet', rootHash: realRoot, destPath: join(dir, 'n.bin') }),
    ).rejects.toThrow(/HTTP 404/)
    expect(calls).toBe(1)
  })

  it('retries a 503 then succeeds', async () => {
    let calls = 0
    const fetchImpl: FetchLike = async () => {
      calls++
      if (calls === 1) return { ok: false, status: 503, arrayBuffer: empty }
      return { ok: true, status: 200, body: streamOf(bytes), arrayBuffer: empty }
    }
    const retriever = new HttpModelRetriever({ fetchImpl, ...noWait })
    const result = await retriever.retrieve({
      network: 'testnet',
      rootHash: realRoot,
      destPath: join(dir, 's.bin'),
    })
    expect(result.sizeBytes).toBe(bytes.length)
    expect(calls).toBe(2)
  })
})
