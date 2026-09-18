/**
 * Run 4 — GATE 4: retrieve the delivered model on this Windows host.
 *
 * Uses the project's own Windows-safe HttpModelRetriever (services/orchestrator/
 * src/retrieval.ts): HTTP GET {indexer}/file?root=<modelRootHash>, then re-derive
 * the 0G Storage Merkle root of the bytes (storage-hash.ts) and refuse anything
 * that does not match the root the provider committed on-chain.
 *
 * The one hardening: the SDK-shaped default fetch buffers ~93 MB in a single
 * arrayBuffer() with no retry, and that connection drops mid-stream on this host.
 * So the retriever is given a fetchImpl that streams to disk with curl (resume +
 * retry) and hands the retriever the completed bytes. The VALIDATION is unchanged:
 * HttpModelRetriever still recomputes zgStorageRoot and checks it against the
 * on-chain root before writing the destination file.
 *
 *   npx tsx tools/run4-retrieve.mts
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ethers } from 'ethers'
import { HttpModelRetriever } from '../services/orchestrator/src/retrieval.ts'
import { zgStorageRoot } from '../services/orchestrator/src/storage-hash.ts'

const PROVIDER = '0xA02b95Aa6886b1116C4f334eDe00381511E31A09'
const SERVING = '0xC6C075D8039763C8f1EbE580be5ADdf2fd6941bA'
const RPC = 'https://evmrpc-testnet.0g.ai'

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const taskId = readFileSync(at('../runs/run4/task-id.txt'), 'utf8').trim()
const destPath = at('../runs/run4/adapter/model.bin')
const tmpPath = destPath + '.download'
mkdirSync(at('../runs/run4/adapter'), { recursive: true })

const env = Object.fromEntries(
  readFileSync(at('../.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] as const })
)
const user = new ethers.Wallet(
  env.PRIVATE_KEY.startsWith('0x') ? env.PRIVATE_KEY : `0x${env.PRIVATE_KEY}`
).address

// --- read the authoritative on-chain model root ---------------------------------
const abi = [
  'function getDeliverables(address,address) view returns (tuple(bytes id, bytes modelRootHash, bytes encryptedSecret, bool acknowledged)[])',
]
const serving = new ethers.Contract(SERVING, abi, new ethers.JsonRpcProvider(RPC))
const dec = new TextDecoder()
const deliverables = await serving.getDeliverables(user, PROVIDER)
const mine = deliverables.find((d: any) => {
  try { return dec.decode(ethers.getBytes(d.id)) === taskId } catch { return false }
})
if (!mine) throw new Error(`No on-chain deliverable for task ${taskId}`)
const modelRootHash: string = mine.modelRootHash
console.log(`task            : ${taskId}`)
console.log(`modelRootHash   : ${modelRootHash}   (on-chain authority)`)
console.log(`acknowledged    : ${mine.acknowledged}`)

// --- a robust, resuming curl-backed fetch for the retriever ---------------------
const curlFetch = async (url: string) => {
  console.log(`  downloading    : ${url}`)
  let lastErr: unknown
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      execFileSync(
        'curl',
        ['-sS', '-L', '--fail', '--retry', '6', '--retry-delay', '2',
         '--retry-all-errors', '--connect-timeout', '30', '-C', '-', '-o', tmpPath, url],
        { stdio: ['ignore', 'inherit', 'inherit'], maxBuffer: 1 << 30 },
      )
      const size = statSync(tmpPath).size
      console.log(`  attempt ${attempt}     : curl completed, ${size} bytes on disk`)
      const buf = readFileSync(tmpPath)
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
      return { ok: true, status: 200, arrayBuffer: async () => ab as ArrayBuffer }
    } catch (e) {
      lastErr = e
      const partial = existsSync(tmpPath) ? statSync(tmpPath).size : 0
      console.log(`  attempt ${attempt}     : failed (${partial} bytes so far) — ${(e as Error).message.split('\n')[0]}`)
      await new Promise((r) => setTimeout(r, 3000 * attempt))
    }
  }
  throw lastErr
}

// --- retrieve + validate via the real HttpModelRetriever ------------------------
const retriever = new HttpModelRetriever({ fetchImpl: curlFetch as any })

let result
let retrieveErr: unknown
for (let attempt = 1; attempt <= 4; attempt++) {
  try {
    result = await retriever.retrieve({ network: 'testnet', rootHash: modelRootHash, destPath })
    break
  } catch (e) {
    retrieveErr = e
    console.log(`retrieve attempt ${attempt} failed: ${(e as Error).message.split('\n')[0]}`)
    await new Promise((r) => setTimeout(r, 5000 * attempt))
  }
}

if (!result) {
  const partial = existsSync(tmpPath) ? statSync(tmpPath).size : 0
  console.error(`\nRETRIEVAL FAILED after robust retries. bytes-so-far=${partial}. NOT acknowledging.`)
  throw retrieveErr
}

// Independent second check with zgStorageRoot on the file we actually wrote.
const onDisk = readFileSync(destPath)
const recomputed = zgStorageRoot(new Uint8Array(onDisk))
const match = recomputed.toLowerCase() === modelRootHash.toLowerCase()

console.log(`\nretrieved       : ${result.sizeBytes} bytes -> runs/run4/adapter/model.bin`)
console.log(`computed root   : ${result.rootHash}`)
console.log(`recomputed root : ${recomputed}`)
console.log(`root match      : ${match ? 'PASS' : 'FAIL'}`)
if (!match) throw new Error('recomputed root does not match on-chain root — refusing')

try { if (existsSync(tmpPath)) unlinkSync(tmpPath) } catch {}

const crypto = await import('node:crypto')
const sha256 = '0x' + crypto.createHash('sha256').update(onDisk).digest('hex')
writeFileSync(at('../runs/run4/retrieval.json'), JSON.stringify({
  taskId, provider: PROVIDER, network: 'testnet', chainId: 16602,
  modelRootHash, recomputedRoot: recomputed, rootMatch: match,
  sizeBytes: result.sizeBytes, sha256,
  destPath: 'runs/run4/adapter/model.bin',
  retrievedVia: 'HttpModelRetriever (services/orchestrator/src/retrieval.ts) + curl streaming transport',
  retrievedAt: new Date().toISOString(),
}, null, 2) + '\n')
console.log(`sha256          : ${sha256}`)
console.log('recorded        : runs/run4/retrieval.json')
console.log('\nnext: node tools/run4-ack.mjs')
