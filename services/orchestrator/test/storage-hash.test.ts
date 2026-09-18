import { describe, it, expect } from 'vitest'
import { zgStorageRoot } from '../src/storage-hash.js'

/**
 * Known-answer vectors for the 0G Storage file Merkle root.
 *
 * These are the ground truth: every expected value was produced by running the
 * REAL `@0gfoundation/0g-storage-ts-sdk` (v1.2.11) — `new MemData(bytes)` then
 * `merkleTree()` — over the exact bytes `deterministicBytes(size, size + 7)`
 * generates below (and one all-zero buffer). If `zgStorageRoot` ever stops
 * matching these, our Windows-safe retrieval would validate against the wrong
 * hash, so this test is what pins the re-implementation to the SDK.
 *
 * The sizes deliberately cross every boundary that changes the tree shape:
 * sub-chunk, exactly one chunk, chunk+1, exactly one segment (262144), one
 * segment + 1, and multi-segment non-power-of-two files.
 */
const VECTORS: Record<number, string> = {
  1: '0xf52ed931b7e4d0828e80dea7bd7f2d1d82f3096389ee7293772ce8d120e7e547',
  100: '0x2db83bea8e29bc97646ca0cfe9c81c7d983b978ddc97441405065c1d1e539561',
  256: '0x57013d1ceaa18413f8c562e436d443a4e94c4336cf3686deae0c5921d5ad83cd',
  257: '0x3792388321fea06f8f2ddbe08b16ed258286bb91ad497bbc211733dc33389262',
  512: '0x5a3adb13d294a5f47e5e66af4aa5cfd6c17a0678fdd1cc7437b5f513cf0c7b2b',
  1000: '0x05f3ceec245ec310b7dce4354f07819be934394736815ae23a288621dfd9d09c',
  262144: '0x32331d1a172325b3a3553e4ea56886280bfabcc7f173ae5fd1fcb37c7f792638',
  262145: '0xf18f1ec9ac1a2e1061eb3caee4ef8a1db9f1e011043732f7e8e42bfd0311daf5',
  700000: '0xbde7d77461ac19fafe1e85d731c58f024e13a439289c2cda3f05ad3f1805b7bd',
  1500000: '0x7090945fcadfb25dae8e0b3150b6492dd85fb368c1b80571f579e17832c81242',
}

const ZERO_300_ROOT = '0xf73e6947d7d1628b9976a6e40d7b278a8a16405e96324a68df45b12a51b7cfde'

/** The same LCG the vector generator used — must stay identical. */
function deterministicBytes(n: number, seed: number): Uint8Array {
  const a = new Uint8Array(n)
  let x = seed >>> 0
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    a[i] = x & 0xff
  }
  return a
}

describe('zgStorageRoot — matches the real 0G Storage SDK', () => {
  for (const [sizeStr, expected] of Object.entries(VECTORS)) {
    const size = Number(sizeStr)
    it(`reproduces the SDK root for a ${size}-byte file`, () => {
      expect(zgStorageRoot(deterministicBytes(size, size + 7))).toBe(expected)
    })
  }

  it('reproduces the SDK root for an all-zero buffer', () => {
    expect(zgStorageRoot(new Uint8Array(300))).toBe(ZERO_300_ROOT)
  })

  it('is deterministic', () => {
    const bytes = deterministicBytes(4096, 99)
    expect(zgStorageRoot(bytes)).toBe(zgStorageRoot(bytes))
  })

  it('changes when a single byte changes', () => {
    const bytes = deterministicBytes(4096, 99)
    const tampered = bytes.slice()
    tampered[0] = (tampered[0]! + 1) & 0xff
    expect(zgStorageRoot(tampered)).not.toBe(zgStorageRoot(bytes))
  })

  it('refuses an empty artifact rather than inventing a root', () => {
    expect(() => zgStorageRoot(new Uint8Array(0))).toThrow(/empty/i)
  })
})
